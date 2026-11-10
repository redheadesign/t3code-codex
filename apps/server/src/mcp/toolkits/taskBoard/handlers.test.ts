import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import { ManagedProjectFolders } from "../../../project/ManagedProjectFolders.ts";
import { ProjectService } from "../../../project/ProjectService.ts";
import { TaskBoardService } from "../../../taskWorkspace/TaskBoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { liveThreadShell } from "../../McpToolAccess.testkit.ts";
import * as TaskBoardHandlers from "./handlers.ts";
import { TaskBoardToolkit } from "./tools.ts";

it.effect("requires a named project and only writes to its board outside Plan mode", () =>
  Effect.gen(function* () {
    const scratch = ProjectId.make("scratch");
    const projectId = ProjectId.make("design-project");
    const threadId = ThreadId.make("thread:scratch");
    const board = { revision: 1, tasks: [], wiki: { content: "", updatedAt: null } };
    const writes = yield* Ref.make<ReadonlyArray<ProjectId>>([]);
    const caller = yield* Ref.make({ ...liveThreadShell(threadId), projectId: scratch });
    const dependencies = Layer.mergeAll(
      Layer.succeed(McpInvocationContext.McpInvocationContext, {
        environmentId: EnvironmentId.make("environment"),
        requestNamespace: "provider:scratch",
        thread: {
          threadId,
          providerSessionId: "provider:scratch",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        client: undefined,
        capabilities: new Set(["orchestration" as const]),
        issuedAt: 0,
      }),
      Layer.mock(ThreadManagement.ThreadManagementService)({
        getThreadShell: () => Ref.get(caller),
      }),
      Layer.mock(ProjectService)({
        getById: (id) =>
          Effect.succeedSome({
            id,
            title: id,
            workspaceRoot: `/projects/${id}`,
            defaultModelSelection: null,
            scripts: [],
            createdAt: "2026-10-18T00:00:00.000Z",
            updatedAt: "2026-10-18T00:00:00.000Z",
            deletedAt: null,
          }),
      }),
      Layer.mock(ManagedProjectFolders)({
        isScratchProject: (id) => Effect.succeed(id === scratch),
      }),
      Layer.mock(TaskBoardService)({
        read: () => Effect.succeed(board),
        command: ({ projectId }) =>
          Ref.update(writes, (projects) => [...projects, projectId]).pipe(Effect.as(board)),
      }),
    );
    yield* Effect.gen(function* () {
      const toolkit = yield* TaskBoardToolkit;
      const command = {
        _tag: "createLocalTask" as const,
        title: "Add a design example",
        description: "Show how design components are reused.",
      };
      const withoutProject = yield* toolkit
        .handle("t3_task_board", {})
        .pipe(Stream.unwrap, Stream.runCollect);
      const scratchWrite = yield* toolkit
        .handle("t3_task_update", { projectId: scratch, revision: board.revision, command })
        .pipe(Stream.unwrap, Stream.runCollect);
      const projectRead = yield* toolkit
        .handle("t3_task_board", { projectId })
        .pipe(Stream.unwrap, Stream.runCollect);
      const projectWrite = yield* toolkit
        .handle("t3_task_update", { projectId, revision: board.revision, command })
        .pipe(Stream.unwrap, Stream.runCollect);
      yield* Ref.update(caller, (thread) => ({ ...thread, interactionMode: "plan" }));
      const planRead = yield* toolkit
        .handle("t3_task_board", { projectId })
        .pipe(Stream.unwrap, Stream.runCollect);
      const planWrite = yield* toolkit
        .handle("t3_task_update", { projectId, revision: board.revision, command })
        .pipe(Stream.unwrap, Stream.runCollect);
      expect(withoutProject.at(-1)?.result).toMatchObject({ code: "target_required" });
      expect(scratchWrite.at(-1)?.result).toMatchObject({ code: "target_required" });
      expect(projectRead.at(-1)?.result).toMatchObject({ projectId, revision: board.revision });
      expect(projectWrite.at(-1)?.result).toMatchObject({ revision: board.revision });
      expect(planRead.at(-1)?.result).toMatchObject({ projectId, revision: board.revision });
      expect(planWrite.at(-1)?.result).toMatchObject({ code: "capability_denied" });
      expect(yield* Ref.get(writes)).toEqual([projectId]);
    }).pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(TaskBoardHandlers.layer).pipe(
          Layer.provideMerge(dependencies),
        ),
      ),
    );
  }),
);
