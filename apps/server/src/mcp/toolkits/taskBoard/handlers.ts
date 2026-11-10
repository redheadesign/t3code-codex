import {
  OrchestratorMcpFailure,
  TaskWorkspaceError,
  type ProjectId,
  type TaskWorkspaceBoardTask,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import {
  DispatchModeLimit,
  type DispatchModeRefusal,
} from "../../../orchestration-v2/DispatchModeLimit.ts";
import * as Projects from "../../../project/ProjectService.ts";
import { TaskBoardService } from "../../../taskWorkspace/TaskBoardService.ts";
import { assertSameLink } from "../../linkOrigin.ts";
import { threadLinkFor, type McpInvocationScope } from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import {
  assertTargetWithinLimits,
  readCaller,
  resolveProjectId,
  unavailable,
} from "../../threadAccess.ts";
import { TaskBoardToolkit } from "./tools.ts";

const PAGE_SIZE = 25;
const WIKI_PAGE_SIZE = 8_000;

const boardFailure = (error: TaskWorkspaceError) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message: error.message });

function summarize(task: TaskWorkspaceBoardTask, scope: McpInvocationScope) {
  const { id, title, status, threadId, claim, blockedBy } = task;
  return {
    id,
    title,
    status,
    threadId,
    claim,
    blockedBy,
    ...(threadId === null ? {} : { link: threadLinkFor(scope, threadId) }),
  };
}

const target = Effect.fn("mcp.resolveTaskBoard")(function* (
  requestedProject: ProjectId | undefined,
) {
  const context = yield* readCaller();
  const projectId = yield* resolveProjectId(context, requestedProject);
  const projects = yield* Projects.ProjectService;
  const project = yield* projects.getById(projectId).pipe(Effect.mapError(unavailable));
  if (Option.isNone(project)) {
    return yield* new OrchestratorMcpFailure({
      code: "invalid_request",
      message: "Project not found.",
    });
  }
  return { context, projectId, service: yield* TaskBoardService };
});

export const layer = McpToolAccess.toLayer(TaskBoardToolkit, {
  t3_task_board: McpToolAccess.reads(
    Effect.fn("mcp.readTaskBoard")(function* (input) {
      const { context, projectId, service } = yield* target(input.projectId);
      const board = yield* service
        .read(projectId, { taskId: input.taskId })
        .pipe(Effect.mapError(boardFailure));
      const currentTask = board.tasks.find((task) => task.threadId === context.caller?.id);
      const selected =
        input.taskId === undefined
          ? currentTask
          : board.tasks.find(({ id }) => id === input.taskId);
      if (input.taskId !== undefined && selected === undefined) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "Task not found in this project.",
        });
      }
      const wikiPages = board.wiki.pages ?? [];
      const selectedWikiPage = wikiPages.find(({ id }) => id === input.wikiPageId);
      if (input.wikiPageId !== undefined && selectedWikiPage === undefined) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "Wiki page not found in this project.",
        });
      }
      const wiki = selectedWikiPage ?? board.wiki;
      const offset = input.offset ?? 0;
      const wikiOffset = input.wikiOffset ?? 0;
      const tasks = board.tasks.filter(
        ({ status }) => input.status === undefined || input.status === status,
      );
      return {
        projectId,
        revision: board.revision,
        tasks: tasks
          .slice(offset, offset + PAGE_SIZE)
          .map((task) => summarize(task, context.scope)),
        task:
          selected === undefined
            ? null
            : {
                ...selected,
                description: selected.description.slice(0, 8_000),
                comments: selected.comments
                  .slice(-8)
                  .map((comment) => ({ ...comment, body: comment.body.slice(0, 1_000) })),
                activity: selected.activity.slice(-8),
                ...(selected.initialBrief === undefined
                  ? {}
                  : { initialBrief: selected.initialBrief.slice(0, 8_000) }),
                ...(selected.links === undefined ? {} : { links: selected.links.slice(-16) }),
                ...(selected.threadHistory === undefined
                  ? {}
                  : { threadHistory: selected.threadHistory.slice(-16) }),
              },
        currentTaskId: currentTask?.id ?? null,
        nextOffset: offset + PAGE_SIZE < tasks.length ? offset + PAGE_SIZE : null,
        wiki: {
          updatedAt: wiki.updatedAt,
          content: wiki.content.slice(wikiOffset, wikiOffset + WIKI_PAGE_SIZE),
        },
        ...(wikiPages.length === 0
          ? {}
          : {
              wikiPages: wikiPages.map(({ id, title, updatedAt, archivedAt }) => ({
                id,
                title,
                updatedAt,
                archivedAt,
              })),
            }),
        wikiNextOffset:
          wikiOffset + WIKI_PAGE_SIZE < wiki.content.length ? wikiOffset + WIKI_PAGE_SIZE : null,
      };
    }),
  ),
  t3_task_update: McpToolAccess.writes(
    Effect.fn("mcp.updateTaskBoard")(function* (input) {
      const { context, projectId, service } = yield* target(input.projectId);
      const { caller, scope, limits, threads } = context;
      const { command } = input;
      const closing = command._tag === "updateLocalTask" && command.status === "done";
      const refused = yield* Ref.make<DispatchModeRefusal | undefined>(undefined);
      const board = yield* service
        .command({
          projectId,
          revision: input.revision,
          command,
          actor: {
            name: (caller?.id ?? scope.client?.label ?? "MCP client").slice(0, 256),
            source: caller === undefined ? "user" : "agent",
            threadDefaults: {
              ...limits,
              ...(caller === undefined ? {} : { modelSelection: caller.modelSelection }),
            },
            authorizeThread: (threadId) =>
              threads.getThreadShell(threadId).pipe(
                Effect.flatMap((thread) => {
                  if (thread === null) return Effect.void;
                  if (closing && thread.activeRunId !== null) {
                    return Effect.fail(
                      new OrchestratorMcpFailure({
                        code: "invalid_request",
                        message:
                          "Move a running task to Review. Mark it done after its chat turn ends.",
                      }),
                    );
                  }
                  return assertSameLink(context, thread).pipe(
                    Effect.andThen(assertTargetWithinLimits(limits, thread)),
                  );
                }),
                Effect.mapError(
                  (error) =>
                    new TaskWorkspaceError({ operation: "thread", message: error.message }),
                ),
              ),
          },
        })
        .pipe(
          Effect.provideService(DispatchModeLimit, { ...limits, refused }),
          Effect.mapError(boardFailure),
        );
      const task =
        command._tag === "createLocalTask"
          ? board.tasks[0]
          : "taskId" in command
            ? board.tasks.find(({ id }) => id === command.taskId)
            : undefined;
      return { revision: board.revision, task: task === undefined ? null : summarize(task, scope) };
    }),
  ),
});
