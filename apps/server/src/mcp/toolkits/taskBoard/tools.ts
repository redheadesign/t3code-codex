import {
  NonNegativeInt,
  OrchestratorMcpFailure,
  ProjectId,
  TaskWorkspaceBoard,
  TaskWorkspaceBoardCommand,
  TaskWorkspaceBoardTask,
  TaskWorkspaceProjectWiki,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import * as Project from "../../../project/ProjectService.ts";
import { TaskBoardService } from "../../../taskWorkspace/TaskBoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagement.ThreadManagementService,
    Project.ProjectService,
    TaskBoardService,
  ],
};

const taskSummary = Schema.Struct({
  id: TaskWorkspaceBoardTask.fields.id,
  title: TaskWorkspaceBoardTask.fields.title,
  status: TaskWorkspaceBoardTask.fields.status,
  threadId: TaskWorkspaceBoardTask.fields.threadId,
  claim: TaskWorkspaceBoardTask.fields.claim,
  blockedBy: TaskWorkspaceBoardTask.fields.blockedBy,
  link: Schema.optional(Schema.String),
});

const TaskBoardTool = Tool.make("t3_task_board", {
  ...shared,
  description:
    "Read a project's local task board and wiki. Omit projectId inside a T3 chat. Pass taskId for details and handoff notes. Use nextOffset and wikiNextOffset to continue. Tasks without a threadId have no chat yet.",
  parameters: Schema.Struct({
    projectId: Schema.optional(ProjectId),
    taskId: Schema.optional(TaskWorkspaceBoardTask.fields.id),
    offset: Schema.optional(NonNegativeInt),
    wikiOffset: Schema.optional(NonNegativeInt),
    status: Schema.optional(TaskWorkspaceBoardTask.fields.status),
  }),
  success: Schema.Struct({
    projectId: ProjectId,
    revision: TaskWorkspaceBoard.fields.revision,
    tasks: Schema.Array(taskSummary),
    task: Schema.NullOr(TaskWorkspaceBoardTask),
    currentTaskId: Schema.NullOr(TaskWorkspaceBoardTask.fields.id),
    nextOffset: Schema.NullOr(NonNegativeInt),
    wiki: TaskWorkspaceProjectWiki,
    wikiNextOffset: Schema.NullOr(NonNegativeInt),
  }),
}).annotate(Tool.Readonly, true);

const TaskUpdateTool = Tool.make("t3_task_update", {
  ...shared,
  description:
    "Change the local task board using its current revision from t3_task_board. Claim before taking work. Comment with results or handoff details, then release. Use openLocalTask only if asked to create the task's chat. Moving a linked task to done archives its chat.",
  parameters: Schema.Struct({
    projectId: Schema.optional(ProjectId),
    revision: TaskWorkspaceBoard.fields.revision,
    command: TaskWorkspaceBoardCommand,
  }),
  success: Schema.Struct({
    revision: TaskWorkspaceBoard.fields.revision,
    task: Schema.NullOr(taskSummary),
  }),
}).annotate(Tool.Destructive, true);

export const TaskBoardToolkit = Toolkit.make(TaskBoardTool, TaskUpdateTool);
