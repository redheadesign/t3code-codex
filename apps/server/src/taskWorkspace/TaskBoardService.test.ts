import { ProjectId, ThreadId, type TaskWorkspaceBoardCommand } from "@t3tools/contracts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import { describe, it } from "@effect/vitest";
import { expect } from "vite-plus/test";

import migration from "../persistence/Migrations/081_TaskBoards.ts";
import { makeTaskBoardService } from "./TaskBoardService.ts";

const projectId = ProjectId.make("work");
const otherProject = ProjectId.make("other");
const timestamp = DateTime.makeUnsafe("2026-11-10T10:00:00.000Z");
const user = { name: "Designer", source: "user" } as const;
const firstAgent = { name: "first-chat", source: "agent" } as const;
const otherAgent = { name: "other-chat", source: "agent" } as const;
const layer = Layer.mergeAll(NodeCrypto.layer, NodeSqliteClient.layer({ filename: ":memory:" }));

const setup = Effect.fn("TaskBoardService.testSetup")(function* () {
  yield* migration;
  const sql = yield* SqlClient.SqlClient;
  const existingId = ThreadId.make("existing");
  const initial = {
    id: existingId,
    title: "Existing chat",
    activeRunId: null,
    archivedAt: null as DateTime.Utc | null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const chats = new Map([[existingId, initial]]);
  const threads: Parameters<typeof makeTaskBoardService>[1] = {
    list: (id) => Effect.sync(() => (id === projectId ? [...chats.values()] : [])),
    open: ({ threadId, title }) =>
      Effect.sync(() => {
        chats.set(threadId, { ...initial, id: threadId, title });
      }),
    rename: (threadId, title) =>
      Effect.sync(() => {
        const chat = chats.get(threadId);
        if (chat !== undefined) chats.set(threadId, { ...chat, title });
      }),
    archive: (threadId, archived) =>
      Effect.sync(() => {
        const chat = chats.get(threadId);
        if (chat !== undefined)
          chats.set(threadId, { ...chat, archivedAt: archived ? timestamp : null });
      }),
  };
  const service = yield* makeTaskBoardService(sql, threads);
  const command = (
    revision: number,
    command: TaskWorkspaceBoardCommand,
    actor: typeof user | typeof firstAgent | typeof otherAgent = user,
  ) => service.command({ projectId, revision, command, actor });
  return { service, chats, existingId, command, reload: () => makeTaskBoardService(sql, threads) };
});

describe("TaskBoardService", () => {
  it.effect(
    "projects existing chats, opens one durable chat per backlog task and archives or restores its chat",
    () =>
      Effect.gen(function* () {
        const { service, chats, existingId, command, reload } = yield* setup();
        const initial = yield* service.read(projectId);
        expect(initial.tasks.map(({ threadId }) => threadId)).toEqual([existingId]);
        const created = yield* command(initial.revision, {
          _tag: "createLocalTask",
          title: "New task",
          description: "Design a screen",
        });
        const task = created.tasks[0]!;
        expect(task).toMatchObject({ status: "backlog", threadId: null });
        const opened = yield* command(created.revision, { _tag: "openLocalTask", taskId: task.id });
        expect(opened.tasks[0]?.status).toBe("todo");
        const threadId = opened.tasks[0]!.threadId!;
        const openedAgain = yield* command(opened.revision, {
          _tag: "openLocalTask",
          taskId: task.id,
        });
        expect(openedAgain.revision).toBe(opened.revision);
        expect(chats.size).toBe(2);
        const done = yield* command(opened.revision, {
          _tag: "updateLocalTask",
          taskId: task.id,
          title: "Design screen",
          status: "done",
        });
        expect(chats.get(threadId)).toMatchObject({
          archivedAt: timestamp,
          title: "Design screen",
        });
        yield* command(done.revision, { _tag: "updateProjectWiki", content: "## Visual design" });
        const restarted = yield* reload();
        const board = yield* restarted.read(projectId);
        expect(board.tasks.find(({ id }) => id === task.id)).toMatchObject({
          status: "done",
          threadId,
        });
        expect(board.wiki.content).toBe("## Visual design");
        expect((yield* restarted.read(otherProject)).tasks).toEqual([]);
        const reopened = yield* command(board.revision, {
          _tag: "updateLocalTask",
          taskId: task.id,
          status: "todo",
        });
        expect(reopened.tasks[0]).toMatchObject({ status: "todo", threadId });
        expect(chats.get(threadId)?.archivedAt).toBeNull();
        const nativeChat = chats.get(existingId)!;
        chats.set(existingId, { ...nativeChat, archivedAt: timestamp });
        expect(
          (yield* restarted.read(projectId)).tasks.find((task) => task.threadId === existingId)
            ?.status,
        ).toBe("done");
      }).pipe(Effect.provide(layer)),
  );

  it.effect(
    "prevents cycles and double claims, and retains handoff comments when a task is released",
    () =>
      Effect.gen(function* () {
        const { service, command } = yield* setup();
        const first = yield* command(0, {
          _tag: "createLocalTask",
          title: "Blocker",
          description: "",
        });
        const blockerId = first.tasks[0]!.id;
        const second = yield* command(first.revision, {
          _tag: "createLocalTask",
          title: "Dependent",
          description: "",
        });
        const taskId = second.tasks[0]!.id;
        const linked = yield* command(second.revision, {
          _tag: "updateLocalTask",
          taskId,
          blockedBy: [blockerId],
        });
        const cycle = yield* command(linked.revision, {
          _tag: "updateLocalTask",
          taskId: blockerId,
          blockedBy: [taskId],
        }).pipe(Effect.flip);
        expect(cycle.operation).toBe("dependency");
        const claim = { _tag: "claimLocalTask", taskId, owner: "Ignored for agents" } as const;
        expect(
          (yield* command(linked.revision, claim, firstAgent).pipe(Effect.flip)).operation,
        ).toBe("claim");
        const unblocked = yield* command(linked.revision, {
          _tag: "updateLocalTask",
          taskId: blockerId,
          status: "done",
        });
        const results = yield* Effect.all(
          [
            command(unblocked.revision, claim, firstAgent).pipe(Effect.result),
            command(unblocked.revision, claim, otherAgent).pipe(Effect.result),
          ],
          { concurrency: 2 },
        );
        expect(results.filter(({ _tag }) => _tag === "Success")).toHaveLength(1);
        const board = yield* service.read(projectId);
        const owner = board.tasks.find(({ id }) => id === taskId)?.claim?.owner;
        const winner = owner === firstAgent.name ? firstAgent : otherAgent;
        const loser = winner === firstAgent ? otherAgent : firstAgent;
        expect(owner).toBe(winner.name);
        expect((yield* command(board.revision, claim, loser).pipe(Effect.flip)).operation).toBe(
          "claim",
        );
        const commented = yield* command(
          board.revision,
          { _tag: "commentLocalTask", taskId, body: "Ready for the next agent." },
          winner,
        );
        const released = yield* command(
          commented.revision,
          { _tag: "releaseLocalTask", taskId },
          winner,
        );
        expect(released.tasks[0]).toMatchObject({
          claim: null,
          comments: [{ author: winner.name, body: "Ready for the next agent." }],
        });
        expect(released.tasks[0]?.activity.map(({ kind }) => kind)).toContain("released");
      }).pipe(Effect.provide(layer)),
  );
});
