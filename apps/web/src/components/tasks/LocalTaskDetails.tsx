import type {
  EnvironmentId,
  TaskWorkspaceBoardStatus,
  TaskWorkspaceBoardTask,
  TaskWorkspaceCommand,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { Link2Icon, MessageSquareIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";

import ChatMarkdown from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { BOARD_COLUMNS } from "./TaskBoard";

export const TASK_TITLE_LIMIT = 256;
export const TASK_TEXT_LIMIT = 200_000;
const ACTIVITY_DATE = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function TaskTimestamp({ value }: { value: string }) {
  return <time dateTime={value}>{ACTIVITY_DATE.format(new Date(value))}</time>;
}

function TaskLinks({
  label,
  tasks,
  onOpen,
  onRemove,
  disabled,
}: {
  label: string;
  tasks: ReadonlyArray<
    Pick<TaskWorkspaceBoardTask, "id" | "title"> & { status: TaskWorkspaceBoardStatus | null }
  >;
  onOpen: (id: string) => void;
  onRemove?: (id: string) => void;
  disabled: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <ul className="space-y-1">
        {tasks.map((task) => (
          <li key={task.id} className="flex min-w-0 items-center justify-between gap-2">
            <Button
              size="sm-multiline"
              variant="ghost-muted"
              disabled={task.status === null}
              onClick={() => onOpen(task.id)}
            >
              <Link2Icon />
              <span className="text-start wrap-anywhere">{task.title}</span>
            </Button>
            {task.status === "done" ? (
              <Badge size="sm" variant="success">
                Done
              </Badge>
            ) : null}
            {onRemove ? (
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label={`Remove dependency on ${task.title}`}
                disabled={disabled}
                onClick={() => onRemove(task.id)}
              >
                <XIcon />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LocalTaskDetails({
  task,
  tasks,
  environmentId,
  workspaceRoot,
  disabled,
  error,
  onClose,
  onSelect,
  onCopyLink,
  onOpenChat,
  onCommand,
}: {
  task: TaskWorkspaceBoardTask;
  tasks: ReadonlyArray<TaskWorkspaceBoardTask>;
  environmentId: EnvironmentId;
  workspaceRoot: string;
  disabled: boolean;
  error: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCopyLink: () => void;
  onOpenChat: (taskId: string) => void;
  onCommand: (command: TaskWorkspaceCommand) => Promise<boolean>;
}) {
  const [edit, setEdit] = useState<{
    title: string;
    description: string;
    baseTitle: string;
    baseDescription: string;
  } | null>(null);
  const [owner, setOwner] = useState("");
  const [comment, setComment] = useState("");
  const dependencies = new Set(task.blockedBy);
  const byId = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  const blockers = task.blockedBy.map(
    (id) => byId.get(id) ?? { id, title: "Unavailable task", status: null },
  );
  const blocks = tasks.filter((candidate) => candidate.blockedBy.includes(task.id));
  const availableDependencies = tasks.filter(
    (candidate) => candidate.id !== task.id && !dependencies.has(candidate.id),
  );
  const isBlocked = blockers.some((candidate) => candidate.status !== "done");
  const editStale =
    edit !== null && (edit.baseTitle !== task.title || edit.baseDescription !== task.description);
  const updateDependencies = (blockedBy: ReadonlyArray<string>) =>
    void onCommand({ _tag: "updateLocalTask", taskId: task.id, blockedBy });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <span className="block pe-6">{task.title}</span>
          </DialogTitle>
          <DialogDescription>
            Created <TaskTimestamp value={task.createdAt} />
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {error ? (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {task.threadId !== null ? (
              <Button
                size="sm"
                render={
                  <Link
                    to="/$environmentId/$threadId"
                    params={{ environmentId, threadId: task.threadId }}
                  />
                }
              >
                <MessageSquareIcon />
                Open chat
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={disabled || task.status === "done"}
                onClick={() => onOpenChat(task.id)}
              >
                <MessageSquareIcon />
                Start chat
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onCopyLink}>
              <Link2Icon />
              Copy task link
            </Button>
          </div>
          <div className="grid gap-5 pt-2 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.65fr)]">
            <section className="min-w-0 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Description</h2>
                {edit === null ? (
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label="Edit task"
                    disabled={disabled}
                    onClick={() =>
                      setEdit({
                        title: task.title,
                        description: task.description,
                        baseTitle: task.title,
                        baseDescription: task.description,
                      })
                    }
                  >
                    <PencilIcon />
                  </Button>
                ) : null}
              </div>
              {edit ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!edit.title.trim() || disabled || editStale) return;
                    void onCommand({
                      _tag: "updateLocalTask",
                      taskId: task.id,
                      title: edit.title.trim(),
                      description: edit.description,
                    }).then((saved) => {
                      if (saved) setEdit(null);
                    });
                  }}
                >
                  <label className="grid gap-1 text-sm">
                    Title
                    <Input
                      value={edit.title}
                      maxLength={TASK_TITLE_LIMIT}
                      disabled={disabled}
                      onChange={(event) => setEdit({ ...edit, title: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Description
                    <Textarea
                      value={edit.description}
                      maxLength={TASK_TEXT_LIMIT}
                      disabled={disabled}
                      onChange={(event) => setEdit({ ...edit, description: event.target.value })}
                    />
                  </label>
                  {editStale ? (
                    <p role="alert" className="text-sm text-warning-foreground">
                      This task changed while you were editing. Copy your draft before reopening the
                      latest version.
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={disabled || editStale || !edit.title.trim()}
                    >
                      Save changes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost-muted"
                      disabled={disabled}
                      onClick={() => setEdit(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : task.description ? (
                <ChatMarkdown
                  text={task.description}
                  cwd={workspaceRoot}
                  environmentId={environmentId}
                  headingLevelOffset={2}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No description</p>
              )}
            </section>
            <section className="min-w-0 space-y-4">
              <div className="space-y-1.5">
                <h2 className="text-sm font-semibold">Status</h2>
                <Select<TaskWorkspaceBoardStatus>
                  value={task.status}
                  disabled={disabled}
                  onValueChange={(status) => {
                    if (status !== null && status !== task.status)
                      void onCommand({ _tag: "updateLocalTask", taskId: task.id, status });
                  }}
                >
                  <SelectTrigger size="sm" width="fluid" aria-label="Task status">
                    <SelectValue>
                      {(status) => BOARD_COLUMNS.find((column) => column.status === status)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {BOARD_COLUMNS.filter(
                      (column) => column.status !== "backlog" || task.threadId === null,
                    ).map(({ status, label }) => (
                      <SelectItem key={status} value={status}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-sm font-semibold">Owner</h2>
                {task.claim ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm wrap-anywhere">{task.claim.owner}</span>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => void onCommand({ _tag: "releaseLocalTask", taskId: task.id })}
                    >
                      Release
                    </Button>
                  </div>
                ) : (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!owner.trim() || disabled) return;
                      void onCommand({
                        _tag: "claimLocalTask",
                        taskId: task.id,
                        owner: owner.trim(),
                      }).then((saved) => {
                        if (saved) setOwner("");
                      });
                    }}
                  >
                    <Input
                      size="sm"
                      value={owner}
                      maxLength={TASK_TITLE_LIMIT}
                      aria-label="Owner name"
                      placeholder="Unassigned"
                      disabled={disabled || task.status === "done"}
                      onChange={(event) => setOwner(event.target.value)}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={disabled || !owner.trim() || task.status === "done"}
                    >
                      Assign
                    </Button>
                  </form>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">Dependencies</h2>
                  {isBlocked ? (
                    <Badge size="sm" variant="warning">
                      Blocked
                    </Badge>
                  ) : null}
                </div>
                <TaskLinks
                  label="Blocked by"
                  tasks={blockers}
                  disabled={disabled}
                  onOpen={onSelect}
                  onRemove={(id) =>
                    updateDependencies(task.blockedBy.filter((dependency) => dependency !== id))
                  }
                />
                <TaskLinks label="Blocking" tasks={blocks} disabled={disabled} onOpen={onSelect} />
                <Select<string>
                  value={null}
                  disabled={
                    disabled || availableDependencies.length === 0 || task.blockedBy.length >= 100
                  }
                  onValueChange={(id) => {
                    if (id !== null) updateDependencies([...task.blockedBy, id]);
                  }}
                >
                  <SelectTrigger size="sm" width="fluid" aria-label="Add dependency">
                    <SelectValue placeholder="Add dependency" />
                  </SelectTrigger>
                  <SelectPopup>
                    {availableDependencies.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.title}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            </section>
          </div>
          <section className="space-y-3 border-t border-border pt-4">
            <h2 className="text-sm font-semibold">Comments</h2>
            {task.comments.length > 0 ? (
              <ul className="space-y-3">
                {task.comments.map((entry) => (
                  <li key={entry.id}>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium wrap-anywhere">{entry.author}</span>
                      <span className="text-xs text-muted-foreground">
                        <TaskTimestamp value={entry.createdAt} />
                      </span>
                    </div>
                    <ChatMarkdown
                      text={entry.body}
                      cwd={workspaceRoot}
                      environmentId={environmentId}
                      headingLevelOffset={2}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No comments yet</p>
            )}
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!comment.trim() || disabled) return;
                void onCommand({
                  _tag: "commentLocalTask",
                  taskId: task.id,
                  body: comment.trim(),
                }).then((saved) => {
                  if (saved) setComment("");
                });
              }}
            >
              <Textarea
                value={comment}
                maxLength={TASK_TEXT_LIMIT}
                aria-label="Comment"
                placeholder="Add a comment"
                disabled={disabled}
                onChange={(event) => setComment(event.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={disabled || !comment.trim()}
              >
                Post comment
              </Button>
            </form>
          </section>
          <section className="space-y-2 border-t border-border pt-4">
            <h2 className="text-sm font-semibold">Activity</h2>
            {task.activity.length > 0 ? (
              <ol className="space-y-2 text-sm">
                {task.activity.toReversed().map((entry) => (
                  <li key={entry.id} className="flex flex-wrap gap-x-2 gap-y-1">
                    <span className="font-medium wrap-anywhere">{entry.author}</span>
                    <span className="wrap-anywhere">{entry.description}</span>
                    <span className="text-xs text-muted-foreground">
                      <TaskTimestamp value={entry.createdAt} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No task changes yet</p>
            )}
          </section>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
