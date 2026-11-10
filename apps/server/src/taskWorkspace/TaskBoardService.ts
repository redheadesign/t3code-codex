// @effect-diagnostics-next-line nodeBuiltinImport:off - board reconciliation hashes thread IDs synchronously.
import * as NodeCrypto from "node:crypto";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as SqlClient from "effect/sql/SqlClient";

import {
  CommandId,
  DEFAULT_MODEL_BY_PROVIDER,
  isProviderAvailable,
  MessageId,
  type OrchestrationV2ThreadShell,
  type ModelSelection,
  type ProjectId,
  type ProviderInteractionMode,
  resolveProjectProviderInstanceEnabled,
  type RuntimeMode,
  TASK_WORKSPACE_FEEDBACK_COMMENT_MAX_CHARS,
  TASK_WORKSPACE_FEEDBACK_MAX_CHARS,
  TaskWorkspaceBoard,
  TaskWorkspaceBoardCommand,
  TaskWorkspaceError,
  ThreadId,
  type TaskWorkspaceBoardTask,
  type TaskWorkspaceBoardComment,
  type TaskWorkspaceThreadHistoryEntry,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { resolveNewThreadModelSelection } from "@t3tools/shared/usageLimits";

import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as OrchestrationEvents from "../persistence/OrchestrationEventStore.ts";
import * as Projects from "../project/ProjectService.ts";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";

type BoardThread = Pick<
  OrchestrationV2ThreadShell,
  "id" | "title" | "activeRunId" | "archivedAt" | "createdAt" | "updatedAt"
>;

interface BoardActor {
  readonly name: string;
  readonly source: "user" | "agent";
  readonly threadDefaults?: {
    readonly runtimeMode: RuntimeMode;
    readonly interactionMode: ProviderInteractionMode;
    readonly modelSelection?: ModelSelection;
  };
  readonly authorizeThread?: (threadId: ThreadId) => Effect.Effect<void, TaskWorkspaceError>;
}

interface BoardThreads {
  readonly list: (
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<BoardThread>, TaskWorkspaceError>;
  readonly open: (input: {
    readonly projectId: ProjectId;
    readonly threadId: ThreadId;
    readonly title: string;
    readonly actor: BoardActor;
    readonly modelSelection?: ModelSelection;
  }) => Effect.Effect<void, TaskWorkspaceError>;
  readonly rename: (threadId: ThreadId, title: string) => Effect.Effect<void, TaskWorkspaceError>;
  readonly archive: (
    threadId: ThreadId,
    archived: boolean,
  ) => Effect.Effect<void, TaskWorkspaceError>;
  readonly send: (input: {
    readonly projectId: ProjectId;
    readonly threadId: ThreadId;
    readonly messageId: MessageId;
    readonly text: string;
    readonly modelSelection?: ModelSelection;
  }) => Effect.Effect<"queued" | "started" | null, TaskWorkspaceError>;
  readonly context: (input: {
    readonly projectId: ProjectId;
    readonly threadId: ThreadId;
  }) => Effect.Effect<
    {
      readonly initialBrief?: string;
      readonly threadHistory: ReadonlyArray<TaskWorkspaceThreadHistoryEntry>;
    },
    TaskWorkspaceError
  >;
}

interface BoardReadTarget {
  readonly taskId?: string | undefined;
  readonly threadId?: ThreadId | undefined;
}

export class TaskBoardService extends Context.Service<
  TaskBoardService,
  {
    readonly read: (
      projectId: ProjectId,
      target?: BoardReadTarget,
    ) => Effect.Effect<TaskWorkspaceBoard, TaskWorkspaceError>;
    readonly command: (input: {
      readonly projectId: ProjectId;
      readonly revision: number;
      readonly command: TaskWorkspaceBoardCommand;
      readonly actor: BoardActor;
    }) => Effect.Effect<TaskWorkspaceBoard, TaskWorkspaceError>;
  }
>()("t3/taskWorkspace/TaskBoardService") {}

export const isBoardCommand = Schema.is(TaskWorkspaceBoardCommand);

const BoardJson = Schema.fromJsonString(TaskWorkspaceBoard);
const decodeBoard = Schema.decodeEffect(BoardJson);
const encodeBoard = Schema.encodeEffect(BoardJson);
const emptyBoard: TaskWorkspaceBoard = {
  revision: 0,
  tasks: [],
  wiki: { content: "", updatedAt: null },
};
const IDEA_PROMPT = `Turn this submission into work on this project's T3 task board. Use t3_task_board to check existing work first. Use t3_task_update to create backlog tasks, update matching tasks and add comments that preserve useful context. Limit this turn to project context and board updates.`;
const FEEDBACK_PROMPT = `Address the feedback below. When you have handled a comment, use t3_task_update with resolveLocalTaskFeedback and its comment ID. Leave the others open.`;

function stableBoardId(parts: ReadonlyArray<string>): string {
  return NodeCrypto.createHash("sha256").update(parts.join("\0")).digest("hex");
}

function linkTarget(kind: "url" | "file" | "design", target: string): string | null {
  if (kind === "url") {
    const url = URL.parse(target);
    return url !== null &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? target
      : null;
  }
  if (kind === "design") return /^[\w-]{1,256}$/u.test(target) ? target : null;
  const relative = target.replaceAll("\\", "/").replace(/^\.\//u, "");
  return relative
    .split("/")
    .every((part) => part !== "" && part !== ".." && part !== "." && !part.includes(":")) &&
    !relative.includes("\0")
    ? relative
    : null;
}
const statusLabels = {
  backlog: "Backlog",
  todo: "To do",
  inProgress: "In progress",
  review: "Review",
  done: "Done",
} as const;

const boardError = (operation: string, message: string, cause?: unknown) =>
  new TaskWorkspaceError({ operation, message, ...(cause === undefined ? {} : { cause }) });

function taskIdForThread(threadId: ThreadId): string {
  return `chat-${NodeCrypto.createHash("sha256").update(threadId).digest("hex")}`;
}

function threadIdForTask(task: TaskWorkspaceBoardTask): ThreadId {
  const key = `${task.id}/${task.threadId ?? ""}`;
  return ThreadId.make(`board-${NodeCrypto.createHash("sha256").update(key).digest("hex")}`);
}

function taskForThread(thread: BoardThread): TaskWorkspaceBoardTask {
  return {
    id: taskIdForThread(thread.id),
    title: thread.title.trim().slice(0, 256) || "Untitled chat",
    description: "",
    status:
      thread.archivedAt !== null ? "done" : thread.activeRunId !== null ? "inProgress" : "todo",
    threadId: thread.id,
    claim: null,
    blockedBy: [],
    comments: [],
    activity: [],
    createdAt: DateTime.formatIso(thread.createdAt),
    updatedAt: DateTime.formatIso(thread.updatedAt),
  };
}

function reconcileBoard(
  board: TaskWorkspaceBoard,
  threads: ReadonlyArray<BoardThread>,
): TaskWorkspaceBoard {
  const unlinkedThreads = new Map(threads.map((thread) => [thread.id, thread] as const));
  const tasks = board.tasks.map((task): TaskWorkspaceBoardTask => {
    // The deterministic ID recovers a chat if its creation committed before the board write.
    const thread =
      (task.threadId === null ? undefined : unlinkedThreads.get(task.threadId)) ??
      unlinkedThreads.get(threadIdForTask(task));
    if (thread === undefined) return { ...task, threadId: null };
    unlinkedThreads.delete(thread.id);
    const current = taskForThread(thread);
    const status =
      current.status === "done"
        ? "done"
        : task.status === "done" || task.status === "backlog"
          ? "todo"
          : task.status;
    return {
      ...task,
      title: current.title,
      threadId: current.threadId,
      status,
      claim: status === "done" ? null : task.claim,
      updatedAt: current.updatedAt > task.updatedAt ? current.updatedAt : task.updatedAt,
    };
  });
  for (const thread of unlinkedThreads.values()) tasks.push(taskForThread(thread));
  return {
    ...board,
    tasks: tasks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

function hasDependencyCycle(
  taskId: string,
  dependencies: ReadonlyArray<string>,
  tasks: ReadonlyMap<string, TaskWorkspaceBoardTask>,
): boolean {
  const pending = [...dependencies];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const dependencyId = pending.pop();
    if (dependencyId === undefined || visited.has(dependencyId)) continue;
    if (dependencyId === taskId) return true;
    visited.add(dependencyId);
    pending.push(...(tasks.get(dependencyId)?.blockedBy ?? []));
  }
  return false;
}

export const makeTaskBoardService = Effect.fn("TaskBoardService.make")(function* (
  sql: SqlClient.SqlClient,
  threads: BoardThreads,
) {
  const lock = yield* Semaphore.make(1);
  const random = yield* SecureRandom.SecureRandom;

  const readStored = Effect.fn("TaskBoardService.readStored")(function* (projectId: ProjectId) {
    const [row] = yield* sql<{ payload_json: string }>`
      SELECT payload_json FROM task_boards WHERE project_id = ${projectId}
    `.pipe(Effect.mapError((cause) => boardError("read", "Could not read the task board.", cause)));
    if (row === undefined) return emptyBoard;
    return yield* decodeBoard(row.payload_json).pipe(
      Effect.mapError((cause) => boardError("read", "The stored task board is malformed.", cause)),
    );
  });

  const persist = Effect.fn("TaskBoardService.persist")(function* (
    projectId: ProjectId,
    previousRevision: number,
    board: TaskWorkspaceBoard,
  ) {
    const contents = yield* encodeBoard(board).pipe(
      Effect.mapError((cause) => boardError("write", "Could not encode the task board.", cause)),
    );
    const [written] = yield* sql<{ revision: number }>`
      INSERT INTO task_boards (project_id, revision, payload_json)
      VALUES (${projectId}, ${board.revision}, ${contents})
      ON CONFLICT (project_id) DO UPDATE SET revision = excluded.revision,
        payload_json = excluded.payload_json WHERE task_boards.revision = ${previousRevision}
      RETURNING revision
    `.pipe(
      Effect.mapError((cause) => boardError("write", "Could not save the task board.", cause)),
    );
    if (written === undefined)
      return yield* boardError("revision", "The task board changed. Reload and try again.");
  });

  const read = Effect.fn("TaskBoardService.read")(function* (
    projectId: ProjectId,
    target?: BoardReadTarget,
  ) {
    const stored = yield* readStored(projectId);
    const board = reconcileBoard(stored, yield* threads.list(projectId));
    if (target?.taskId === undefined && target?.threadId === undefined) return board;
    const selected = board.tasks.find((task) =>
      target.taskId === undefined ? task.threadId === target.threadId : task.id === target.taskId,
    );
    if (selected?.threadId == null) return board;
    const context = yield* threads.context({ projectId, threadId: selected.threadId });
    return {
      ...board,
      tasks: board.tasks.map((task) =>
        task.id === selected.id
          ? {
              ...task,
              ...context,
              ...(task.initialBrief ? { initialBrief: task.initialBrief } : {}),
            }
          : task,
      ),
    };
  });

  const applyCommand = Effect.fn("TaskBoardService.command")(function* (
    input: Parameters<TaskBoardService["Service"]["command"]>[0],
  ) {
    const { projectId, actor, command } = input;
    const stored = yield* readStored(projectId);
    const stale = input.revision !== stored.revision;
    if (
      stale &&
      command._tag !== "sendLocalTaskFeedback" &&
      command._tag !== "submitLocalTaskIdeas"
    ) {
      return yield* boardError("revision", "The task board changed. Reload and try again.");
    }
    const projectThreads = yield* threads.list(projectId);
    const current = reconcileBoard(stored, projectThreads);
    const timestamp = DateTime.formatIso(yield* DateTime.now);
    const next = { ...stored, revision: stored.revision + 1 };

    if (command._tag === "submitLocalTaskIdeas") {
      if (actor.source !== "user" || actor.threadDefaults !== undefined)
        return yield* boardError("intake", "Submit ideas from the task board.");
      const prompt = command.prompt.trim();
      if (prompt.length === 0) return yield* boardError("intake", "Enter an idea first.");
      const existing = projectThreads.find((thread) => thread.id === stored.intakeThreadId);
      const threadId =
        existing?.id ??
        ThreadId.make(`ideas-${stableBoardId([projectId, stored.intakeThreadId ?? ""])}`);
      if (existing === undefined) {
        if (stale)
          return yield* boardError("revision", "The task board changed. Reload and try again.");
        if (!projectThreads.some((thread) => thread.id === threadId)) {
          yield* threads.open({
            projectId,
            threadId,
            title: "Project ideas",
            actor,
            modelSelection: command.modelSelection,
          });
        }
        yield* persist(projectId, stored.revision, { ...next, intakeThreadId: threadId });
      }
      yield* threads.send({
        projectId,
        threadId,
        messageId: MessageId.make(`idea-${stableBoardId([projectId, command.submissionId])}`),
        modelSelection: command.modelSelection,
        text: `${IDEA_PROMPT}\n\nIdeas\n${prompt}`,
      });
      return yield* read(projectId);
    }

    if (command._tag === "updateProjectWiki") {
      yield* persist(projectId, stored.revision, {
        ...next,
        wiki: { content: command.content, updatedAt: timestamp },
      });
      return {
        ...current,
        revision: next.revision,
        wiki: { content: command.content, updatedAt: timestamp },
      };
    }

    const entryId = yield* random.uuidV4();
    const activity = (
      kind: TaskWorkspaceBoardTask["activity"][number]["kind"],
      description: string,
    ) => ({
      id: entryId,
      kind,
      author: actor.name,
      description,
      createdAt: timestamp,
    });

    if (command._tag === "createLocalTask") {
      const task: TaskWorkspaceBoardTask = {
        id: `task-${entryId}`,
        title: command.title,
        description: command.description,
        initialBrief: command.description,
        status: command.status ?? "backlog",
        threadId: null,
        claim: null,
        blockedBy: [],
        comments: [],
        activity: [activity("created", "Created task")],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      yield* persist(projectId, stored.revision, { ...next, tasks: [...stored.tasks, task] });
      return { ...current, revision: next.revision, tasks: [task, ...current.tasks] };
    }

    const tasks = new Map(current.tasks.map((task) => [task.id, task] as const));
    const task = tasks.get(command.taskId);
    if (task === undefined) return yield* boardError("task", "Task not found in this project.");
    const savedTask = stored.tasks.find(({ id }) => id === task.id);

    if (command._tag === "sendLocalTaskFeedback") {
      if (actor.source !== "user" || actor.threadDefaults !== undefined)
        return yield* boardError("feedback", "Send feedback from the task board.");
      if (task.threadId === null)
        return yield* boardError("feedback", "Start the task chat before sending feedback.");
      const ids = new Set(command.commentIds);
      const selected = task.comments.filter((comment) => ids.has(comment.id));
      if (selected.length !== ids.size || selected.length === 0)
        return yield* boardError("feedback", "Choose feedback from this task.");
      const messageId = MessageId.make(
        `feedback-${stableBoardId([task.id, task.threadId, ...[...ids].sort()])}`,
      );
      const delivered = selected.every(
        (comment) =>
          comment.feedback?.messageId === messageId &&
          (comment.feedback.status === "sent" || comment.feedback.status === "resolved"),
      );
      if (delivered) return current;
      const retry = selected.every(
        (comment) =>
          comment.feedback?.messageId === messageId && comment.feedback.status === "sending",
      );
      if (!retry && stale)
        return yield* boardError("revision", "The task board changed. Reload and try again.");
      if (!retry && selected.some((comment) => comment.feedback?.status !== "pending"))
        return yield* boardError(
          "feedback",
          "Send pending feedback or retry the previous batch separately.",
        );
      if (task.status === "done" && !retry)
        return yield* boardError("feedback", "Reopen the task before sending feedback.");
      if (
        selected.reduce((length, comment) => length + comment.body.length + comment.id.length, 0) >
        TASK_WORKSPACE_FEEDBACK_MAX_CHARS
      )
        return yield* boardError("feedback", "Send a smaller batch of feedback.");

      const updateFeedback = (feedback: NonNullable<TaskWorkspaceBoardComment["feedback"]>) =>
        task.comments.map((comment) => (ids.has(comment.id) ? { ...comment, feedback } : comment));
      const reserve = retry
        ? stored
        : {
            ...next,
            tasks: [
              ...stored.tasks.filter(({ id }) => id !== task.id),
              {
                ...task,
                comments: updateFeedback({ status: "sending", messageId }),
              },
            ],
          };
      if (!retry) yield* persist(projectId, stored.revision, reserve);

      const text = `${FEEDBACK_PROMPT}\n\nTask ${task.title} (${task.id})\n\n${selected.map((comment) => `Feedback ${comment.id}\n${comment.body}`).join("\n\n")}`;
      const delivery = yield* threads.send({ projectId, threadId: task.threadId, messageId, text });
      const sent = {
        ...task,
        updatedAt: timestamp,
        comments: updateFeedback({
          status: "sent",
          messageId,
          sentAt: timestamp,
          ...(delivery === null ? {} : { delivery }),
        }),
        activity: [
          ...task.activity,
          activity(
            "updated",
            delivery === "queued" ? "Queued feedback in chat" : "Sent feedback to chat",
          ),
        ],
      };
      const revision = reserve.revision + 1;
      yield* persist(projectId, reserve.revision, {
        ...reserve,
        revision,
        tasks: [...reserve.tasks.filter(({ id }) => id !== task.id), sent],
      });
      return {
        ...current,
        revision,
        tasks: [sent, ...current.tasks.filter(({ id }) => id !== task.id)],
      };
    }

    let updated: TaskWorkspaceBoardTask;
    switch (command._tag) {
      case "updateLocalTask": {
        if (actor.source === "agent" && task.claim !== null && task.claim.owner !== actor.name) {
          return yield* boardError("claim", `This task is already claimed by ${task.claim.owner}.`);
        }
        const blockedBy = [...new Set(command.blockedBy ?? task.blockedBy)];
        if (command.blockedBy !== undefined && blockedBy.some((id) => !tasks.has(id))) {
          return yield* boardError("dependency", "Each blocker must be a task in this project.");
        }
        if (command.blockedBy !== undefined && hasDependencyCycle(task.id, blockedBy, tasks)) {
          return yield* boardError("dependency", "This dependency would form a cycle.");
        }
        const status = command.status ?? task.status;
        if (status === "backlog" && task.threadId !== null) {
          return yield* boardError("task", "Tasks with a chat can move to To do.");
        }
        const titleChanged = command.title !== undefined && command.title !== task.title;
        const archiveChanged = (task.status === "done") !== (status === "done");
        if (task.threadId !== null && (titleChanged || archiveChanged)) {
          if (actor.authorizeThread !== undefined) yield* actor.authorizeThread(task.threadId);
          if (command.title !== undefined && titleChanged)
            yield* threads.rename(task.threadId, command.title);
          if (archiveChanged) yield* threads.archive(task.threadId, status === "done");
        }
        updated = {
          ...task,
          title: command.title ?? task.title,
          description: command.description ?? task.description,
          ...(task.initialBrief === undefined && task.description
            ? { initialBrief: task.description }
            : {}),
          status,
          blockedBy,
          claim: status === "done" ? null : task.claim,
          activity: [
            ...task.activity,
            activity(
              "updated",
              status === task.status ? "Updated details" : `Moved to ${statusLabels[status]}`,
            ),
          ],
        };
        break;
      }
      case "openLocalTask": {
        if (task.threadId !== null) return current;
        if (task.status === "done")
          return yield* boardError("task", "Reopen the task before creating its chat.");
        const threadId = threadIdForTask(savedTask ?? task);
        yield* threads.open({ projectId, threadId, title: task.title, actor });
        updated = {
          ...task,
          threadId,
          status: task.status === "backlog" ? "todo" : task.status,
          activity: [...task.activity, activity("linked", "Created chat")],
        };
        break;
      }
      case "commentLocalTask": {
        const body = command.body.trim();
        if (body.length === 0) return yield* boardError("comment", "Enter a comment.");
        const isFeedback = actor.source === "user" && actor.threadDefaults === undefined;
        if (isFeedback && body.length > TASK_WORKSPACE_FEEDBACK_COMMENT_MAX_CHARS)
          return yield* boardError(
            "comment",
            "Shorten the comment so it can be sent to the task chat.",
          );
        updated = {
          ...task,
          comments: [
            ...task.comments,
            {
              id: entryId,
              author: actor.name,
              body,
              createdAt: timestamp,
              source: actor.source,
              ...(isFeedback ? { feedback: { status: "pending" } as const } : {}),
            },
          ],
        };
        break;
      }
      case "resolveLocalTaskFeedback": {
        const feedback = task.comments.find(
          (comment) => comment.id === command.commentId,
        )?.feedback;
        if (feedback === undefined)
          return yield* boardError("feedback", "Feedback not found in this task.");
        if (feedback.status === "resolved") return current;
        if (
          feedback.status === "sending" ||
          (actor.source === "agent" && feedback.status !== "sent")
        )
          return yield* boardError(
            "feedback",
            "Wait until the feedback is sent before resolving it.",
          );
        updated = {
          ...task,
          comments: task.comments.map((comment) =>
            comment.id === command.commentId
              ? { ...comment, feedback: { ...feedback, status: "resolved", resolvedAt: timestamp } }
              : comment,
          ),
          activity: [...task.activity, activity("updated", "Resolved feedback")],
        };
        break;
      }
      case "addLocalTaskLink": {
        const target = linkTarget(command.kind, command.target);
        if (target === null)
          return yield* boardError(
            "link",
            "Enter an HTTP link, a project-relative path, or a Canvas document ID.",
          );
        const links = task.links ?? [];
        if (links.some((link) => link.kind === command.kind && link.target === target))
          return current;
        if (links.length >= 64)
          return yield* boardError("link", "Remove a link before adding another.");
        updated = {
          ...task,
          links: [
            ...links,
            {
              id: entryId,
              title: command.title,
              kind: command.kind,
              target,
              author: actor.name,
              createdAt: timestamp,
            },
          ],
          activity: [...task.activity, activity("updated", `Linked ${command.title}`)],
        };
        break;
      }
      case "removeLocalTaskLink": {
        const link = task.links?.find(({ id }) => id === command.linkId);
        if (link === undefined) return current;
        updated = {
          ...task,
          links: task.links?.filter(({ id }) => id !== command.linkId) ?? [],
          activity: [...task.activity, activity("updated", `Removed link to ${link.title}`)],
        };
        break;
      }
      case "claimLocalTask": {
        const owner = actor.source === "agent" ? actor.name : command.owner;
        if (task.claim?.owner === owner) return current;
        if (task.claim !== null)
          return yield* boardError("claim", `This task is already claimed by ${task.claim.owner}.`);
        if (task.status === "done")
          return yield* boardError("claim", "Reopen the task before claiming it.");
        if (task.blockedBy.some((id) => tasks.get(id)?.status !== "done")) {
          return yield* boardError("claim", "Finish the blocking tasks before claiming this task.");
        }
        updated = {
          ...task,
          claim: { owner, claimedAt: timestamp },
          status: "inProgress",
          activity: [...task.activity, activity("claimed", `Claimed by ${owner}`)],
        };
        break;
      }
      case "releaseLocalTask": {
        if (task.claim === null) return current;
        if (actor.source === "agent" && actor.name !== task.claim.owner) {
          return yield* boardError(
            "claim",
            "Only the claiming agent or a user can release this task.",
          );
        }
        updated = {
          ...task,
          claim: null,
          activity: [
            ...task.activity,
            activity("released", `Released ${task.claim.owner}'s claim`),
          ],
        };
        break;
      }
    }

    const saved = { ...updated, updatedAt: timestamp };
    yield* persist(projectId, stored.revision, {
      ...next,
      tasks: [
        ...stored.tasks.filter(({ id }) => id !== task.id),
        {
          ...saved,
          threadId: saved.threadId ?? savedTask?.threadId ?? null,
        },
      ],
    });
    return {
      ...current,
      revision: next.revision,
      tasks: [saved, ...current.tasks.filter(({ id }) => id !== task.id)],
    };
  });

  return TaskBoardService.of({
    read: Effect.fn("TaskBoardService.readLocked")((projectId, target) =>
      lock.withPermits(1)(read(projectId, target)),
    ),
    command: Effect.fn("TaskBoardService.commandLocked")((input) =>
      lock.withPermits(1)(applyCommand(input)),
    ),
  });
});

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const events = yield* OrchestrationEvents.OrchestrationEventStore;
  const projects = yield* Projects.ProjectService;
  const settings = yield* ServerSettings.ServerSettingsService;
  const providers = yield* ProviderRegistry.ProviderRegistry;
  const random = yield* SecureRandom.SecureRandom;

  const dispatch = Effect.fn("TaskBoardService.dispatch")(function* (
    command: Parameters<ThreadManagement.ThreadManagementService["Service"]["dispatch"]>[0],
  ) {
    yield* threads
      .dispatch(command)
      .pipe(Effect.mapError((cause) => boardError("thread", cause.message, cause)));
  });

  return yield* makeTaskBoardService(sql, {
    list: Effect.fn("TaskBoardService.listThreads")(function* (projectId) {
      const snapshot = yield* threads
        .getShellSnapshot({ projectId })
        .pipe(
          Effect.mapError((cause) =>
            boardError("thread", "Could not read the project's chats.", cause),
          ),
        );
      return snapshot.threads.filter((thread) => thread.lineage.sideChat !== true);
    }),
    open: Effect.fn("TaskBoardService.openThread")(function* ({
      projectId,
      threadId,
      title,
      actor,
      modelSelection,
    }) {
      const project = yield* projects
        .getById(projectId)
        .pipe(
          Effect.mapError((cause) => boardError("thread", "Could not read the project.", cause)),
        );
      const defaults = resolveProjectSettings(
        yield* settings.getSettings.pipe(
          Effect.mapError((cause) =>
            boardError("thread", "Could not read the project settings.", cause),
          ),
        ),
        projectId,
        Option.getOrUndefined(project),
      ).settings;
      const available = yield* providers.getProviders;
      const fallback = available.find(
        (provider) =>
          provider.enabled &&
          provider.installed &&
          isProviderAvailable(provider) &&
          provider.auth.status !== "unauthenticated" &&
          resolveProjectProviderInstanceEnabled(defaults, projectId, provider.instanceId),
      );
      const fallbackModel =
        fallback === undefined
          ? undefined
          : (fallback.models.find((model) => model.isDefault && !model.isCustom)?.slug ??
            fallback.models.find((model) => !model.isCustom)?.slug ??
            fallback.models[0]?.slug ??
            DEFAULT_MODEL_BY_PROVIDER[fallback.driver]);
      const { selection } = resolveNewThreadModelSelection({
        defaultSelection:
          defaults.defaultModelSelection ??
          (fallback === undefined || fallbackModel === undefined
            ? null
            : { instanceId: fallback.instanceId, model: fallbackModel }),
        explicitSelection: modelSelection ?? actor.threadDefaults?.modelSelection ?? null,
        fallbackSelection: defaults.fallbackModelSelection,
        providers: available,
        settings: defaults,
        projectId,
        now: DateTime.toEpochMillis(yield* DateTime.now),
      });
      if (selection === null)
        return yield* boardError("thread", "Configure a model in the project settings first.");
      yield* dispatch({
        type: "thread.create",
        commandId: CommandId.make(threadId),
        threadId,
        projectId,
        title,
        createdBy: actor.source,
        creationSource: actor.threadDefaults === undefined ? "web" : "mcp",
        modelSelection: selection,
        runtimeMode: actor.threadDefaults?.runtimeMode ?? defaults.defaultRuntimeMode,
        interactionMode: actor.threadDefaults?.interactionMode ?? "default",
        branch: null,
        worktreePath: null,
      });
    }),
    rename: Effect.fn("TaskBoardService.renameThread")(function* (threadId, title) {
      yield* dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make(yield* random.uuidV4()),
        threadId,
        title,
      });
    }),
    archive: Effect.fn("TaskBoardService.archiveThread")(function* (threadId, archived) {
      yield* dispatch({
        type: archived ? "thread.archive" : "thread.unarchive",
        commandId: CommandId.make(yield* random.uuidV4()),
        threadId,
      });
    }),
    send: Effect.fn("TaskBoardService.sendToThread")(function* (input) {
      const alreadyDelivered = threads
        .getProjectThreadRecords(input, ["messages"], { messageIds: [input.messageId] })
        .pipe(
          Effect.map((records) =>
            records.messages.some((message) => message.id === input.messageId),
          ),
          Effect.mapError((cause) =>
            boardError("thread", "Could not confirm delivery to the task chat.", cause),
          ),
        );
      if (yield* alreadyDelivered) return null;
      return yield* threads
        .sendToThread({
          ...input,
          commandId: CommandId.make(yield* random.uuidV4()),
          attachments: [],
          mode: "queue",
          createdBy: "user",
          creationSource: "web",
        })
        .pipe(
          Effect.map(({ delivery }) =>
            delivery === "queued" ? ("queued" as const) : ("started" as const),
          ),
          Effect.catch((cause) =>
            alreadyDelivered.pipe(
              Effect.flatMap((delivered) =>
                delivered
                  ? Effect.succeed(null)
                  : Effect.fail(boardError("thread", cause.message, cause)),
              ),
            ),
          ),
        );
    }),
    context: Effect.fn("TaskBoardService.threadContext")(function* (input) {
      const records = yield* threads
        .getProjectThreadRecords(input, ["runs"])
        .pipe(
          Effect.mapError((cause) =>
            boardError("history", "Could not load task chat history.", cause),
          ),
        );
      const runs = [...records.runs].sort((left, right) => left.ordinal - right.ordinal);
      const firstMessageId = runs[0]?.userMessageId;
      const brief =
        firstMessageId === undefined
          ? undefined
          : yield* threads
              .getProjectThreadRecords(input, ["messages"], { messageIds: [firstMessageId] })
              .pipe(
                Effect.map(({ messages }) =>
                  messages.find((message) => message.id === firstMessageId)?.text.slice(0, 200_000),
                ),
                Effect.mapError((cause) =>
                  boardError("history", "Could not load the initial brief.", cause),
                ),
              );
      const loadEvents = (
        eventType: "thread.created" | "thread.metadata-updated" | "thread.provider-switched",
        limit: number,
      ) =>
        events.readAgentEvents({ threadId: input.threadId, eventType, limit }).pipe(
          Stream.runCollect,
          Effect.mapError((cause) =>
            boardError("history", "Could not load task chat changes.", cause),
          ),
        );
      const [created, metadata, providerEvents, availableProviders] = yield* Effect.all(
        [
          loadEvents("thread.created", 1),
          loadEvents("thread.metadata-updated", 128),
          loadEvents("thread.provider-switched", 64),
          providers.getProviders,
        ],
        { concurrency: 4 },
      );
      const driverByInstance = new Map(
        availableProviders.map((provider) => [provider.instanceId, provider.driver] as const),
      );
      const threadHistory: TaskWorkspaceThreadHistoryEntry[] = [];
      const branchHistory: { time: number; branch: string | null }[] = [];
      const original = created[0]?.event;
      let branch = original?.type === "thread.created" ? original.payload.branch : undefined;
      if (original?.type === "thread.created") {
        branchHistory.push({
          time: DateTime.toEpochMillis(original.occurredAt),
          branch: original.payload.branch,
        });
        if (original.payload.branch !== null) {
          threadHistory.push({
            id: `event-${created[0]!.sequence}`,
            kind: "branch",
            branch: original.payload.branch,
            description: `Started on ${original.payload.branch}`,
            createdAt: DateTime.formatIso(original.occurredAt),
          });
        }
      }
      for (const { sequence, event } of metadata) {
        if (event.type !== "thread.metadata-updated" || event.payload.branch === branch) continue;
        const previous = branch;
        branch = event.payload.branch;
        branchHistory.push({ time: DateTime.toEpochMillis(event.occurredAt), branch });
        if (previous === undefined && branch === null) continue;
        threadHistory.push({
          id: `event-${sequence}`,
          kind: "branch",
          branch,
          ...(previous === undefined ? {} : { previousBranch: previous }),
          description:
            branch === null
              ? "Cleared the branch"
              : previous === undefined
                ? `Recorded branch ${branch}`
                : `Changed branch to ${branch}`,
          createdAt: DateTime.formatIso(event.occurredAt),
        });
      }
      for (const { sequence, event } of providerEvents) {
        if (event.type !== "thread.provider-switched") continue;
        const { instanceId, model } = event.payload.modelSelection;
        const provider = event.driver ?? driverByInstance.get(instanceId);
        if (event.driver !== undefined) driverByInstance.set(instanceId, event.driver);
        threadHistory.push({
          id: `event-${sequence}`,
          kind: "provider",
          branch: event.payload.branch,
          ...(provider === undefined ? {} : { provider }),
          description: `Switched to ${model} (${instanceId})`,
          createdAt: DateTime.formatIso(event.occurredAt),
        });
      }
      for (const run of runs.slice(-30)) {
        const { model } = run.modelSelection;
        const provider = driverByInstance.get(run.providerInstanceId);
        const started = run.startedAt ?? run.requestedAt;
        const runBranch =
          metadata.length < 128
            ? branchHistory.findLast((entry) => entry.time <= DateTime.toEpochMillis(started))
                ?.branch
            : undefined;
        const lane = {
          ...(runBranch === undefined ? {} : { branch: runBranch }),
          ...(provider === undefined ? {} : { provider }),
        };
        threadHistory.push({
          id: `run-${stableBoardId([run.id, "start"])}`,
          kind: "run",
          runId: run.id,
          ...lane,
          description: `${run.startedAt === null ? "Requested" : "Started"} ${model}`,
          createdAt: DateTime.formatIso(started),
        });
        if (run.completedAt === null) continue;
        const label =
          run.status === "rolled_back"
            ? "Rolled back"
            : `${run.status.charAt(0).toUpperCase()}${run.status.slice(1)}`;
        threadHistory.push({
          id: `run-${stableBoardId([run.id, "end"])}`,
          kind: "run",
          runId: run.id,
          ...lane,
          description: `${label} ${model}`,
          createdAt: DateTime.formatIso(run.completedAt),
        });
      }
      threadHistory.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      return {
        ...(brief === undefined ? {} : { initialBrief: brief }),
        threadHistory: threadHistory.slice(-80),
      };
    }),
  });
});

export const layer = Layer.effect(TaskBoardService, make);
