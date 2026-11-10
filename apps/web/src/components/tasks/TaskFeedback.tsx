import {
  TASK_WORKSPACE_FEEDBACK_COMMENT_MAX_CHARS,
  type EnvironmentId,
  type TaskWorkspaceBoardTask,
  type TaskWorkspaceCommand,
} from "@t3tools/contracts";
import { CheckIcon, Clock3Icon, MessageSquareIcon, PlayIcon, RotateCwIcon } from "lucide-react";
import { useState } from "react";
import { useUiText } from "~/i18n";

import ChatMarkdown from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { TaskTimestamp } from "./TaskHistory";
import { pendingTaskFeedback } from "./taskFeedbackBatch";

export function TaskFeedback({
  task,
  environmentId,
  workspaceRoot,
  disabled,
  chatTitles,
  onCommand,
}: {
  task: TaskWorkspaceBoardTask;
  environmentId: EnvironmentId;
  workspaceRoot: string;
  disabled: boolean;
  chatTitles: ReadonlyMap<string, string>;
  onCommand: (command: TaskWorkspaceCommand) => Promise<boolean>;
}) {
  const text = useUiText();
  const [comment, setComment] = useState("");
  const timeline = [
    ...task.activity.map((entry) => ({ type: "change" as const, entry })),
    ...task.comments.map((entry) => ({ type: "comment" as const, entry })),
  ].sort((left, right) => Date.parse(right.entry.createdAt) - Date.parse(left.entry.createdAt));
  const pending = pendingTaskFeedback(task.comments);
  const sendingBatches = new Map<string, string[]>();
  for (const entry of task.comments) {
    if (entry.feedback?.status !== "sending") continue;
    const key = entry.feedback.messageId ?? entry.id;
    const batch = sendingBatches.get(key) ?? [];
    batch.push(entry.id);
    sendingBatches.set(key, batch);
  }
  const sendDisabled = disabled || task.threadId === null || task.status === "done";
  const sendFeedback = (commentIds: ReadonlyArray<string>) => {
    void onCommand({ _tag: "sendLocalTaskFeedback", taskId: task.id, commentIds });
  };
  return (
    <section className="min-w-0 space-y-4 border-t border-border pt-4 md:col-start-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{text("Activity", "Активность")}</h2>
        {pending.count > 1 && pending.commentIds.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={sendDisabled}
            onClick={() => sendFeedback(pending.commentIds)}
          >
            <PlayIcon />
            {text(
              `Send feedback (${pending.commentIds.length})`,
              `Отправить замечания (${pending.commentIds.length})`,
            )}
          </Button>
        ) : null}
      </div>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!comment.trim() || disabled) return;
          void onCommand({ _tag: "commentLocalTask", taskId: task.id, body: comment.trim() }).then(
            (saved) => {
              if (saved) setComment("");
            },
          );
        }}
      >
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {text("Add a comment", "Добавить комментарий")}
          <Textarea
            value={comment}
            maxLength={TASK_WORKSPACE_FEEDBACK_COMMENT_MAX_CHARS}
            aria-label={text("Comment", "Комментарий")}
            placeholder={text("Handoff note", "Замечание или заметка")}
            disabled={disabled}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="outline" disabled={disabled || !comment.trim()}>
            {text("Post comment", "Добавить комментарий")}
          </Button>
        </div>
      </form>
      {pending.count > 0 && task.threadId === null ? (
        <p className="text-xs text-muted-foreground">
          {text(
            "Start the task chat to send feedback to its agent.",
            "Чтобы отправить замечания агенту, откройте чат задачи.",
          )}
        </p>
      ) : null}
      {timeline.length > 0 ? (
        <ol
          aria-label={text("Task activity", "Активность по задаче")}
          className="divide-y divide-border/60"
        >
          {timeline.map((item) => {
            const Icon = item.type === "comment" ? MessageSquareIcon : Clock3Icon;
            const feedback = item.type === "comment" ? item.entry.feedback : undefined;
            const batch =
              feedback?.status === "sending"
                ? sendingBatches.get(feedback.messageId ?? item.entry.id)
                : undefined;
            const label =
              feedback?.status === "pending"
                ? text("Pending", "К отправке")
                : feedback?.status === "sending"
                  ? text("Sending", "Отправляется")
                  : feedback?.status === "resolved"
                    ? text("Processed", "Обработано")
                    : feedback?.status === "sent"
                      ? feedback.delivery === "queued"
                        ? text("Queued", "В очереди")
                        : text("Sent", "Отправлено")
                      : null;
            return (
              <li key={`${item.type}:${item.entry.id}`} className="flex gap-2.5 py-3 first:pt-0">
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium wrap-anywhere">
                      {chatTitles.get(item.entry.author) ?? item.entry.author}
                    </span>
                    {item.type === "change" ? (
                      <span className="wrap-anywhere text-muted-foreground">
                        {item.entry.description}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      <TaskTimestamp value={item.entry.createdAt} />
                    </span>
                    {label ? (
                      <Badge
                        variant={feedback?.status === "resolved" ? "success" : "outline"}
                        size="sm"
                      >
                        {label}
                      </Badge>
                    ) : null}
                  </div>
                  {item.type === "comment" ? (
                    <ChatMarkdown
                      text={item.entry.body}
                      cwd={workspaceRoot}
                      environmentId={environmentId}
                      headingLevelOffset={2}
                    />
                  ) : null}
                  {feedback?.status === "pending" &&
                  pending.count === 1 &&
                  pending.commentIds.length === 1 ? (
                    <Button
                      size="xs"
                      variant="ghost-muted"
                      disabled={sendDisabled}
                      onClick={() => sendFeedback([item.entry.id])}
                    >
                      <PlayIcon />
                      {text("Send feedback", "Отправить замечание")}
                    </Button>
                  ) : batch?.[0] === item.entry.id ? (
                    <Button
                      size="xs"
                      variant="ghost-muted"
                      disabled={sendDisabled}
                      onClick={() => sendFeedback(batch)}
                    >
                      <RotateCwIcon />
                      {text("Retry feedback", "Повторить отправку")}
                    </Button>
                  ) : feedback?.status === "sent" ? (
                    <Button
                      size="xs"
                      variant="ghost-muted"
                      disabled={disabled}
                      onClick={() =>
                        void onCommand({
                          _tag: "resolveLocalTaskFeedback",
                          taskId: task.id,
                          commentId: item.entry.id,
                        })
                      }
                    >
                      <CheckIcon />
                      {text("Mark processed", "Отметить обработанным")}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          {text(
            "Comments and changes to the task appear here.",
            "Здесь появятся комментарии и изменения задачи.",
          )}
        </p>
      )}
    </section>
  );
}
