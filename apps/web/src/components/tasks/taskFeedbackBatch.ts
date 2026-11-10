import {
  TASK_WORKSPACE_FEEDBACK_MAX_CHARS,
  TASK_WORKSPACE_FEEDBACK_MAX_COMMENTS,
  type TaskWorkspaceBoardComment,
} from "@t3tools/contracts";

export function pendingTaskFeedback(comments: ReadonlyArray<TaskWorkspaceBoardComment>) {
  let count = 0;
  let characters = 0;
  const commentIds: string[] = [];
  for (const comment of comments) {
    if (comment.feedback?.status !== "pending") continue;
    count++;
    const length = comment.body.length + comment.id.length;
    if (
      commentIds.length >= TASK_WORKSPACE_FEEDBACK_MAX_COMMENTS ||
      characters + length > TASK_WORKSPACE_FEEDBACK_MAX_CHARS
    )
      continue;
    commentIds.push(comment.id);
    characters += length;
  }
  return { count, commentIds };
}
