import {
  NonNegativeInt,
  OrchestratorMcpFailure,
  ProjectId,
  TaskWorkspaceBoard,
  TaskWorkspaceBoardAgentCommand,
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
    "Read a project's task board and wiki. Omit projectId inside a T3 chat. Pass taskId for the brief, feedback, artifact links and chat history. Use nextOffset and wikiNextOffset to continue.",
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
    "Update tasks with the current revision from t3_task_board. Claim work, comment with results, then release. Resolve feedback after addressing it. Artifact targets are HTTP(S) URLs, project-relative files or Canvas document IDs. Moving a linked task to done archives its chat. Open a new task chat only when asked.",
  parameters: Schema.Struct({
    projectId: Schema.optional(ProjectId),
    revision: TaskWorkspaceBoard.fields.revision,
    command: TaskWorkspaceBoardAgentCommand,
  }),
  success: Schema.Struct({
    revision: TaskWorkspaceBoard.fields.revision,
    task: Schema.NullOr(taskSummary),
  }),
}).annotate(Tool.Destructive, true);

export const TaskBoardToolkit = Toolkit.make(TaskBoardTool, TaskUpdateTool);
