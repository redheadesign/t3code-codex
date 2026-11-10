import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  IsoDateTime,
  MessageId,
  ProjectId,
  RunId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";
import { ProviderDriverKind } from "./providerInstance.ts";
import { SecretReference } from "./secretReference.ts";

const ID_LIMIT = 256;
const Id = TrimmedNonEmptyString.check(Schema.isMaxLength(ID_LIMIT));
const LongText = Schema.String.check(Schema.isMaxLength(200_000));
export const TASK_WORKSPACE_FEEDBACK_MAX_COMMENTS = 100;
export const TASK_WORKSPACE_FEEDBACK_MAX_CHARS = 190_000;
export const TASK_WORKSPACE_FEEDBACK_COMMENT_MAX_CHARS =
  TASK_WORKSPACE_FEEDBACK_MAX_CHARS - ID_LIMIT;
export const TASK_WORKSPACE_WIKI_MAX_PAGES = 64;
export const TASK_WORKSPACE_WIKI_PAGE_MAX_CHARS = 64_000;

export const TaskWorkspaceTaskStatus = Schema.Struct({
  name: TrimmedNonEmptyString,
  category: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String),
});
export type TaskWorkspaceTaskStatus = typeof TaskWorkspaceTaskStatus.Type;

export const TaskWorkspaceSprint = Schema.Struct({
  id: Id,
  name: TrimmedNonEmptyString,
  state: Schema.optional(Schema.Literals(["future", "active", "closed"])),
  startAt: Schema.NullOr(IsoDateTime),
  endAt: Schema.NullOr(IsoDateTime),
});
export type TaskWorkspaceSprint = typeof TaskWorkspaceSprint.Type;

export const TaskWorkspaceAttachment = Schema.Struct({
  id: Id,
  name: TrimmedNonEmptyString,
  url: Schema.NullOr(Schema.String),
  mimeType: Schema.NullOr(Schema.String),
});
export type TaskWorkspaceAttachment = typeof TaskWorkspaceAttachment.Type;

export const TaskWorkspaceComment = Schema.Struct({
  id: Id,
  author: TrimmedNonEmptyString,
  body: LongText,
  createdAt: IsoDateTime,
  source: Schema.Literals(["jira", "agent", "system", "user"]),
});
export type TaskWorkspaceComment = typeof TaskWorkspaceComment.Type;

export const TaskWorkspaceIssue = Schema.Struct({
  key: Id,
  summary: TrimmedNonEmptyString,
  description: Schema.String,
  browseUrl: Schema.NullOr(Schema.String),
  status: TaskWorkspaceTaskStatus,
  assignee: Schema.NullOr(TrimmedNonEmptyString),
  assigneeId: Schema.NullOr(TrimmedNonEmptyString),
  priority: Schema.NullOr(TrimmedNonEmptyString),
  sprint: Schema.NullOr(TaskWorkspaceSprint),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  attachments: Schema.optional(Schema.Array(TaskWorkspaceAttachment)),
  comments: Schema.Array(TaskWorkspaceComment),
  sourceRevision: Id,
});
export type TaskWorkspaceIssue = typeof TaskWorkspaceIssue.Type;

export const TaskWorkspaceDraft = Schema.Struct({
  summary: Schema.String,
  description: Schema.String,
  fields: Schema.Record(Schema.String, Schema.String),
  baseRevision: Id,
  dirty: Schema.Boolean,
  updatedAt: IsoDateTime,
});
export type TaskWorkspaceDraft = typeof TaskWorkspaceDraft.Type;

export const TaskWorkspaceStage = Schema.Struct({
  id: Id,
  name: TrimmedNonEmptyString,
  kind: Schema.Literals(["agent", "check", "audit", "publish"]),
  dependsOn: Schema.Array(Id),
  parallel: Schema.Boolean,
  provider: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  skills: Schema.Array(Schema.String),
  connectors: Schema.Array(Schema.String),
  command: Schema.NullOr(Schema.String),
  required: Schema.Boolean,
  rules: Schema.Array(Schema.String),
  prompt: Schema.String,
  timeoutMs: Schema.Int.check(Schema.isBetween({ minimum: 1_000, maximum: 86_400_000 })),
});
export type TaskWorkspaceStage = typeof TaskWorkspaceStage.Type;

export const TaskWorkspaceScenario = Schema.Struct({
  id: Id,
  name: TrimmedNonEmptyString,
  stages: Schema.Array(TaskWorkspaceStage),
  maxVariants: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })),
  maxRetries: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
  enabled: Schema.Boolean,
  autoStart: Schema.optional(Schema.Boolean),
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  selectedVariantIds: Schema.Array(Id).check(Schema.isMaxLength(3)),
});
export type TaskWorkspaceScenario = typeof TaskWorkspaceScenario.Type;

export const TaskWorkspaceArtifact = Schema.Struct({
  id: Id,
  variantId: Id,
  kind: Schema.Literals(["story", "screenshot", "diff", "log", "file", "report"]),
  label: TrimmedNonEmptyString,
  path: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  storyId: Schema.NullOr(Schema.String),
  sourceSha: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
});
export type TaskWorkspaceArtifact = typeof TaskWorkspaceArtifact.Type;

export const TaskWorkspaceCheckResult = Schema.Struct({
  id: Id,
  name: TrimmedNonEmptyString,
  status: Schema.Literals(["queued", "running", "passed", "failed", "skipped"]),
  command: Schema.NullOr(Schema.String),
  exitCode: Schema.NullOr(Schema.Int),
  attempt: Schema.optional(Schema.Int),
  output: Schema.String,
  startedAt: Schema.NullOr(IsoDateTime),
  finishedAt: Schema.NullOr(IsoDateTime),
});
export type TaskWorkspaceCheckResult = typeof TaskWorkspaceCheckResult.Type;

export const TaskWorkspaceVariant = Schema.Struct({
  id: Id,
  label: TrimmedNonEmptyString,
  status: Schema.Literals(["queued", "running", "succeeded", "failed", "cancelled"]),
  worktreePath: Schema.NullOr(Schema.String),
  sourceSha: Id,
  threadIds: Schema.Array(ThreadId),
  completedStageIds: Schema.optional(Schema.Array(Id)),
  checks: Schema.Array(TaskWorkspaceCheckResult),
  artifactIds: Schema.Array(Id),
  output: Schema.optional(Schema.String),
  error: Schema.NullOr(Schema.String),
});
export type TaskWorkspaceVariant = typeof TaskWorkspaceVariant.Type;

export const TaskWorkspaceRunStatus = Schema.Literals([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type TaskWorkspaceRunStatus = typeof TaskWorkspaceRunStatus.Type;

export const TaskWorkspaceRun = Schema.Struct({
  id: Id,
  status: TaskWorkspaceRunStatus,
  sourceRevision: Id,
  startedAt: Schema.NullOr(IsoDateTime),
  finishedAt: Schema.NullOr(IsoDateTime),
  currentStageId: Schema.NullOr(Id),
  variantCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  completedStageIds: Schema.Array(Id),
  error: Schema.NullOr(Schema.String),
  workerThreadIds: Schema.optional(Schema.Array(ThreadId)),
  variants: Schema.Array(TaskWorkspaceVariant),
});
export type TaskWorkspaceRun = typeof TaskWorkspaceRun.Type;

export const TaskWorkspacePublish = Schema.Struct({
  id: Id,
  variantId: Id,
  stageId: Schema.optional(Id),
  phase: Schema.Literals(["queued", "pushing", "commenting", "succeeded", "failed"]),
  branch: TrimmedNonEmptyString,
  sourceSha: Id,
  pushedSha: Schema.NullOr(Id),
  remoteUrl: Schema.optional(Schema.NullOr(Schema.String)),
  commentCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  error: Schema.NullOr(Schema.String),
  updatedAt: IsoDateTime,
});
export type TaskWorkspacePublish = typeof TaskWorkspacePublish.Type;

export const TaskWorkspaceTask = Schema.Struct({
  id: Id,
  environmentId: EnvironmentId,
  projectId: ProjectId,
  issue: TaskWorkspaceIssue,
  draft: Schema.NullOr(TaskWorkspaceDraft),
  scenario: TaskWorkspaceScenario,
  run: Schema.NullOr(TaskWorkspaceRun),
  comments: Schema.Array(TaskWorkspaceComment),
  artifacts: Schema.Array(TaskWorkspaceArtifact),
  publishes: Schema.Array(TaskWorkspacePublish),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type TaskWorkspaceTask = typeof TaskWorkspaceTask.Type;

export const TaskWorkspaceConnection = Schema.Struct({
  configured: Schema.Boolean,
  url: Schema.NullOr(Schema.String),
  username: Schema.NullOr(Schema.String),
  secretConfigured: Schema.Boolean,
  projectKeys: Schema.optional(Schema.Array(Id)),
  secretRef: Schema.optional(Schema.NullOr(SecretReference)),
});
export type TaskWorkspaceConnection = typeof TaskWorkspaceConnection.Type;

export const TaskWorkspaceBoardStatus = Schema.Literals([
  "backlog",
  "todo",
  "inProgress",
  "review",
  "done",
]);
export type TaskWorkspaceBoardStatus = typeof TaskWorkspaceBoardStatus.Type;

export const TaskWorkspaceBoardActivity = Schema.Struct({
  id: Id,
  kind: Schema.Literals(["created", "updated", "linked", "claimed", "released"]),
  author: Id,
  description: LongText,
  createdAt: IsoDateTime,
});

export const TaskWorkspaceBoardComment = Schema.Struct({
  ...TaskWorkspaceComment.fields,
  feedback: Schema.optional(
    Schema.Struct({
      status: Schema.Literals(["pending", "sending", "sent", "resolved"]),
      messageId: Schema.optional(MessageId),
      sentAt: Schema.optional(IsoDateTime),
      delivery: Schema.optional(Schema.Literals(["started", "queued"])),
      resolvedAt: Schema.optional(IsoDateTime),
    }),
  ),
});
export type TaskWorkspaceBoardComment = typeof TaskWorkspaceBoardComment.Type;

const linkFields = {
  title: Id,
  kind: Schema.Literals(["url", "file", "design"]),
  target: TrimmedNonEmptyString.check(Schema.isMaxLength(2_048)),
};
export const TaskWorkspaceBoardLink = Schema.Struct({
  id: Id,
  ...linkFields,
  author: Id,
  createdAt: IsoDateTime,
});
export type TaskWorkspaceBoardLink = typeof TaskWorkspaceBoardLink.Type;

export const TaskWorkspaceThreadHistoryEntry = Schema.Struct({
  id: Id,
  kind: Schema.Literals(["run", "branch", "provider"]),
  description: LongText,
  createdAt: IsoDateTime,
  runId: Schema.optional(RunId),
  branch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  previousBranch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  provider: Schema.optional(ProviderDriverKind),
});
export type TaskWorkspaceThreadHistoryEntry = typeof TaskWorkspaceThreadHistoryEntry.Type;

export const TaskWorkspaceBoardTask = Schema.Struct({
  id: Id,
  title: Id,
  description: LongText,
  status: TaskWorkspaceBoardStatus,
  threadId: Schema.NullOr(ThreadId),
  claim: Schema.NullOr(Schema.Struct({ owner: Id, claimedAt: IsoDateTime })),
  blockedBy: Schema.Array(Id).check(Schema.isMaxLength(100)),
  comments: Schema.Array(TaskWorkspaceBoardComment),
  activity: Schema.Array(TaskWorkspaceBoardActivity),
  initialBrief: Schema.optional(LongText),
  links: Schema.optional(Schema.Array(TaskWorkspaceBoardLink).check(Schema.isMaxLength(64))),
  threadHistory: Schema.optional(Schema.Array(TaskWorkspaceThreadHistoryEntry)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type TaskWorkspaceBoardTask = typeof TaskWorkspaceBoardTask.Type;

export const TaskWorkspaceWikiPageSummary = Schema.Struct({
  id: Id,
  title: Id,
  updatedAt: IsoDateTime,
  archivedAt: Schema.NullOr(IsoDateTime),
});
const TaskWorkspaceWikiPage = Schema.Struct({
  ...TaskWorkspaceWikiPageSummary.fields,
  content: Schema.String.check(Schema.isMaxLength(TASK_WORKSPACE_WIKI_PAGE_MAX_CHARS)),
});

export const TaskWorkspaceProjectWiki = Schema.Struct({
  content: LongText,
  updatedAt: Schema.NullOr(IsoDateTime),
  pages: Schema.optional(
    Schema.Array(TaskWorkspaceWikiPage).check(Schema.isMaxLength(TASK_WORKSPACE_WIKI_MAX_PAGES)),
  ),
});
export type TaskWorkspaceProjectWiki = typeof TaskWorkspaceProjectWiki.Type;

export const TaskWorkspaceBoard = Schema.Struct({
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  tasks: Schema.Array(TaskWorkspaceBoardTask),
  wiki: TaskWorkspaceProjectWiki,
  intakeThreadId: Schema.optional(ThreadId),
});
export type TaskWorkspaceBoard = typeof TaskWorkspaceBoard.Type;

export const TaskWorkspaceSnapshot = Schema.Struct({
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  configured: Schema.Boolean,
  connection: TaskWorkspaceConnection,
  assignee: Schema.NullOr(Schema.String),
  sprints: Schema.Array(TaskWorkspaceSprint),
  tasks: Schema.Array(TaskWorkspaceTask),
  lastSyncedAt: Schema.NullOr(IsoDateTime),
  error: Schema.NullOr(Schema.String),
  board: Schema.optional(TaskWorkspaceBoard),
});
export type TaskWorkspaceSnapshot = typeof TaskWorkspaceSnapshot.Type;

export const TaskWorkspaceReadInput = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
  workspaceRoot: TrimmedNonEmptyString,
  assignee: Schema.optional(Schema.String),
  sprintId: Schema.optional(Schema.String),
  localOnly: Schema.optional(Schema.Boolean),
  taskId: Schema.optional(Id),
  threadId: Schema.optional(ThreadId),
});
export type TaskWorkspaceReadInput = typeof TaskWorkspaceReadInput.Type;

export const TaskWorkspaceSaveDraft = Schema.Struct({
  taskId: Id,
  baseRevision: Id,
  summary: Schema.String,
  description: Schema.String,
  fields: Schema.Record(Schema.String, Schema.String),
});
export const TaskWorkspaceDiscardDraft = Schema.Struct({ taskId: Id });
export const TaskWorkspaceConfigureJira = Schema.Struct({
  url: TrimmedNonEmptyString,
  username: Schema.NullOr(Schema.String),
  secretRef: Schema.NullOr(SecretReference),
  projectKeys: Schema.optional(Schema.Array(Id)),
});
export const TaskWorkspaceConfigureScenario = Schema.Struct({
  taskId: Id,
  scenario: TaskWorkspaceScenario,
});
export const TaskWorkspaceRunScenario = Schema.Struct({ taskId: Id });
export const TaskWorkspaceCancelRun = Schema.Struct({ taskId: Id });
export const TaskWorkspaceRetryStage = Schema.Struct({ taskId: Id, stageId: Id });
export const TaskWorkspaceSelectVariants = Schema.Struct({
  taskId: Id,
  variantIds: Schema.Array(Id).check(Schema.isMaxLength(3)),
});
export const TaskWorkspaceLaunchStorybook = Schema.Struct({
  taskId: Id,
  artifactId: Id,
});
export const TaskWorkspacePublishVariant = Schema.Struct({
  taskId: Id,
  variantId: Id,
  stageId: Schema.optional(Id),
  branch: TrimmedNonEmptyString,
  commentIds: Schema.Array(Id),
});
export const TaskWorkspaceSync = Schema.Struct({});

export const TaskWorkspaceBoardAgentCommand = Schema.Union([
  Schema.TaggedStruct("createLocalTask", {
    title: Id,
    description: LongText,
    status: Schema.optional(TaskWorkspaceBoardStatus),
  }),
  Schema.TaggedStruct("updateLocalTask", {
    taskId: Id,
    title: Schema.optional(Id),
    description: Schema.optional(LongText),
    status: Schema.optional(TaskWorkspaceBoardStatus),
    blockedBy: Schema.optional(TaskWorkspaceBoardTask.fields.blockedBy),
  }),
  Schema.TaggedStruct("openLocalTask", { taskId: Id }),
  Schema.TaggedStruct("commentLocalTask", { taskId: Id, body: LongText }),
  Schema.TaggedStruct("resolveLocalTaskFeedback", { taskId: Id, commentId: Id }),
  Schema.TaggedStruct("addLocalTaskLink", { taskId: Id, ...linkFields }),
  Schema.TaggedStruct("removeLocalTaskLink", { taskId: Id, linkId: Id }),
  Schema.TaggedStruct("claimLocalTask", { taskId: Id, owner: Id }),
  Schema.TaggedStruct("releaseLocalTask", { taskId: Id }),
  Schema.TaggedStruct("updateProjectWiki", { content: LongText }),
  Schema.TaggedStruct("saveProjectWikiPage", {
    pageId: Id,
    title: TaskWorkspaceWikiPage.fields.title,
    content: TaskWorkspaceWikiPage.fields.content,
  }),
  Schema.TaggedStruct("setProjectWikiPageArchived", { pageId: Id, archived: Schema.Boolean }),
]);
export const TaskWorkspaceBoardCommand = Schema.Union([
  TaskWorkspaceBoardAgentCommand,
  Schema.TaggedStruct("sendLocalTaskFeedback", {
    taskId: Id,
    commentIds: Schema.Array(Id).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(TASK_WORKSPACE_FEEDBACK_MAX_COMMENTS),
    ),
  }),
  Schema.TaggedStruct("submitLocalTaskIdeas", {
    submissionId: Id,
    prompt: LongText,
    modelSelection: ModelSelection,
  }),
]);
export type TaskWorkspaceBoardCommand = typeof TaskWorkspaceBoardCommand.Type;

export const TaskWorkspaceCommand = Schema.Union([
  TaskWorkspaceBoardCommand,
  Schema.TaggedStruct("sync", TaskWorkspaceSync.fields),
  Schema.TaggedStruct("configureJira", TaskWorkspaceConfigureJira.fields),
  Schema.TaggedStruct("saveDraft", TaskWorkspaceSaveDraft.fields),
  Schema.TaggedStruct("discardDraft", TaskWorkspaceDiscardDraft.fields),
  Schema.TaggedStruct("configureScenario", TaskWorkspaceConfigureScenario.fields),
  Schema.TaggedStruct("runScenario", TaskWorkspaceRunScenario.fields),
  Schema.TaggedStruct("cancelRun", TaskWorkspaceCancelRun.fields),
  Schema.TaggedStruct("retryStage", TaskWorkspaceRetryStage.fields),
  Schema.TaggedStruct("selectVariants", TaskWorkspaceSelectVariants.fields),
  Schema.TaggedStruct("launchStorybook", TaskWorkspaceLaunchStorybook.fields),
  Schema.TaggedStruct("publishVariant", TaskWorkspacePublishVariant.fields),
]);
export type TaskWorkspaceCommand = typeof TaskWorkspaceCommand.Type;

export const TaskWorkspaceCommandInput = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
  workspaceRoot: TrimmedNonEmptyString,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  command: TaskWorkspaceCommand,
});
export type TaskWorkspaceCommandInput = typeof TaskWorkspaceCommandInput.Type;

export class TaskWorkspaceError extends Schema.TaggedError<TaskWorkspaceError>()(
  "TaskWorkspaceError",
  { message: Schema.String, operation: Schema.String, cause: Schema.optional(Schema.Unknown) },
) {}
