// @effect-diagnostics-next-line nodeBuiltinImport:off - board reconciliation hashes thread IDs synchronously.
import * as NodeCrypto from "node:crypto";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as SqlClient from "effect/sql/SqlClient";

import {
  CommandId,
  DEFAULT_MODEL_BY_PROVIDER,
  isProviderAvailable,
  type OrchestrationV2ThreadShell,
  type ModelSelection,
  type ProjectId,
  type ProviderInteractionMode,
  resolveProjectProviderInstanceEnabled,
  type RuntimeMode,
  TaskWorkspaceBoard,
  TaskWorkspaceBoardCommand,
  TaskWorkspaceError,
  ThreadId,
  type TaskWorkspaceBoardTask,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { resolveNewThreadModelSelection } from "@t3tools/shared/usageLimits";

import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
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
  }) => Effect.Effect<void, TaskWorkspaceError>;
  readonly rename: (threadId: ThreadId, title: string) => Effect.Effect<void, TaskWorkspaceError>;
  readonly archive: (
    threadId: ThreadId,
    archived: boolean,
  ) => Effect.Effect<void, TaskWorkspaceError>;
}

export class TaskBoardService extends Context.Service<
  TaskBoardService,
  {
    readonly read: (projectId: ProjectId) => Effect.Effect<TaskWorkspaceBoard, TaskWorkspaceError>;
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

  const read = Effect.fn("TaskBoardService.read")(function* (projectId: ProjectId) {
    const stored = yield* readStored(projectId);
    return reconcileBoard(stored, yield* threads.list(projectId));
  });

  const applyCommand = Effect.fn("TaskBoardService.command")(function* (
    input: Parameters<TaskBoardService["Service"]["command"]>[0],
  ) {
    const { projectId, actor, command } = input;
    const stored = yield* readStored(projectId);
    if (input.revision !== stored.revision) {
      return yield* boardError("revision", "The task board changed. Reload and try again.");
    }
    const current = reconcileBoard(stored, yield* threads.list(projectId));
    const timestamp = DateTime.formatIso(yield* DateTime.now);
    const next = { ...stored, revision: stored.revision + 1 };

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
        updated = {
          ...task,
          comments: [
            ...task.comments,
            { id: entryId, author: actor.name, body, createdAt: timestamp, source: actor.source },
          ],
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
    read: Effect.fn("TaskBoardService.readLocked")((projectId) =>
      lock.withPermits(1)(read(projectId)),
    ),
    command: Effect.fn("TaskBoardService.commandLocked")((input) =>
      lock.withPermits(1)(applyCommand(input)),
    ),
  });
});

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const threads = yield* ThreadManagement.ThreadManagementService;
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
        explicitSelection: actor.threadDefaults?.modelSelection ?? null,
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
  });
});

export const layer = Layer.effect(TaskBoardService, make);
