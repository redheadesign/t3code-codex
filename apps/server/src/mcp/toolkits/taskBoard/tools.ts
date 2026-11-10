import {
  NonNegativeInt,
  OrchestratorMcpFailure,
  ProjectId,
  TaskWorkspaceBoard,
  TaskWorkspaceBoardAgentCommand,
  TaskWorkspaceBoardTask,
  TaskWorkspaceProjectWiki,
  TaskWorkspaceWikiPageSummary,
} from "@t3tools/contracts";
import { TASK_WORKSPACE_MCP_TOOLS } from "@t3tools/provider-core/server/orchestrationInstructions";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import { ManagedProjectFolders } from "../../../project/ManagedProjectFolders.ts";
import * as Project from "../../../project/ProjectService.ts";
import { TaskBoardService } from "../../../taskWorkspace/TaskBoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagement.ThreadManagementService,
    ManagedProjectFolders,
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

const TaskBoardTool = Tool.make(TASK_WORKSPACE_MCP_TOOLS.read, {
  ...shared,
  description:
    "Read this chat's board and wiki; omit projectId to use its project. Check for duplicates. taskId shows the brief, feedback and links; wikiPageId selects Markdown. Follow nextOffset and wikiNextOffset.",
  parameters: Schema.Struct({
    projectId: Schema.optional(ProjectId),
    taskId: Schema.optional(TaskWorkspaceBoardTask.fields.id),
    offset: Schema.optional(NonNegativeInt),
    wikiOffset: Schema.optional(NonNegativeInt),
    wikiPageId: Schema.optional(TaskWorkspaceWikiPageSummary.fields.id),
    status: Schema.optional(TaskWorkspaceBoardTask.fields.status),
  }),
  success: Schema.Struct({
    projectId: ProjectId,
    revision: TaskWorkspaceBoard.fields.revision,
    tasks: Schema.Array(taskSummary),
    task: Schema.NullOr(TaskWorkspaceBoardTask),
    currentTaskId: Schema.NullOr(TaskWorkspaceBoardTask.fields.id),
    nextOffset: Schema.NullOr(NonNegativeInt),
    wiki: Schema.Struct({
      content: TaskWorkspaceProjectWiki.fields.content,
      updatedAt: TaskWorkspaceProjectWiki.fields.updatedAt,
    }),
    wikiPages: Schema.optional(Schema.Array(TaskWorkspaceWikiPageSummary)),
    wikiNextOffset: Schema.NullOr(NonNegativeInt),
  }),
}).annotate(Tool.Readonly, true);

const TaskUpdateTool = Tool.make(TASK_WORKSPACE_MCP_TOOLS.update, {
  ...shared,
  description:
    "Use the latest board revision; reread on conflict. Save ideas with createLocalTask, status backlog, without starting work. For wiki, read all Markdown, merge and saveProjectWikiPage by ID. Claim, comment, release; resolve addressed feedback. Links: HTTP(S), project-relative file or Canvas ID. Done archives chat. Open chats only on request.",
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
