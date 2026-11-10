import type {
  EnvironmentId,
  TaskWorkspaceBoardStatus,
  TaskWorkspaceBoardTask,
  TaskWorkspaceCommand,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { HistoryIcon, Link2Icon, MessageSquareIcon, PencilIcon, XIcon } from "lucide-react";
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
  const chatTitles = new Map<string, string>();
  for (const candidate of tasks) {
    if (candidate.threadId !== null) chatTitles.set(candidate.threadId, candidate.title);
  }
  const blockers = task.blockedBy.map(
    (id) => byId.get(id) ?? { id, title: "Unavailable task", status: null },
  );
  const blocks = tasks.filter((candidate) => candidate.blockedBy.includes(task.id));
  const availableDependencies = tasks.filter(
    (candidate) => candidate.id !== task.id && !dependencies.has(candidate.id),
  );
  const isBlocked = blockers.some((candidate) => candidate.status !== "done");
  const canAssign = !disabled && !isBlocked && task.status !== "done";
  const timeline = [
    ...task.activity.map((entry) => ({ type: "change" as const, entry })),
    ...task.comments.map((entry) => ({ type: "comment" as const, entry })),
  ].sort((left, right) => Date.parse(right.entry.createdAt) - Date.parse(left.entry.createdAt));
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
      <DialogPopup className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            <span className="block pe-6">{task.title}</span>
          </DialogTitle>
          <DialogDescription>
            Created <TaskTimestamp value={task.createdAt} />
            {task.threadId === null
              ? task.status === "done"
                ? " · Reopen the task to start its chat"
                : " · Start a chat when you’re ready to work on this task"
              : task.status === "done"
                ? " · Chat archived"
                : null}
          </DialogDescription>
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
                {task.status === "done" ? "View archived chat" : "Open chat"}
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
            <Button size="sm" variant="ghost-muted" onClick={onCopyLink}>
              <Link2Icon />
              Copy task link
            </Button>
          </div>
        </DialogHeader>
        <DialogPanel>
          {error ? (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          ) : null}
          <div className="grid gap-5 border-t border-border pt-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.55fr)]">
            <section className="min-w-0 space-y-3 md:col-start-1 md:row-start-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Description</h2>
                {edit === null ? (
                  <Button
                    size="sm"
                    variant="ghost-muted"
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
                    Edit task
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
                <p className="text-sm text-muted-foreground">
                  Add the goal, relevant links, and how to tell when the work is done.
                </p>
              )}
            </section>
            <aside
              aria-label="Task properties"
              className="min-w-0 space-y-4 border-t border-border pt-4 md:col-start-2 md:row-span-2 md:row-start-1 md:border-s md:border-t-0 md:ps-5 md:pt-0"
            >
              <h2 className="text-sm font-semibold">Properties</h2>
              <div className="space-y-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">Status</h3>
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
                <h3 className="text-xs font-medium text-muted-foreground">Assignee</h3>
                {task.claim ? (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm wrap-anywhere">
                        {chatTitles.get(task.claim.owner) ?? task.claim.owner}
                      </span>
                      <Button
                        size="xs"
                        variant="ghost-muted"
                        disabled={disabled}
                        onClick={() =>
                          void onCommand({ _tag: "releaseLocalTask", taskId: task.id })
                        }
                      >
                        Release
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Claimed <TaskTimestamp value={task.claim.claimedAt} />
                    </p>
                  </div>
                ) : (
                  <form
                    className="space-y-1.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!owner.trim() || !canAssign) return;
                      void onCommand({
                        _tag: "claimLocalTask",
                        taskId: task.id,
                        owner: owner.trim(),
                      }).then((saved) => {
                        if (saved) setOwner("");
                      });
                    }}
                  >
                    <p className="text-sm">Unassigned</p>
                    {isBlocked && task.status !== "done" ? (
                      <p className="text-xs text-muted-foreground">
                        Resolve the blockers to assign this task.
                      </p>
                    ) : null}
                    {task.status !== "done" && !isBlocked ? (
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <Input
                            size="sm"
                            value={owner}
                            maxLength={TASK_TITLE_LIMIT}
                            aria-label="Assignee name"
                            placeholder="Name"
                            disabled={!canAssign}
                            onChange={(event) => setOwner(event.target.value)}
                          />
                        </div>
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          disabled={!canAssign || !owner.trim()}
                        >
                          Assign
                        </Button>
                      </div>
                    ) : null}
                  </form>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground">Dependencies</h3>
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
                {blockers.length === 0 && blocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No linked tasks</p>
                ) : null}
                <Select<string>
                  value={null}
                  disabled={
                    disabled || availableDependencies.length === 0 || task.blockedBy.length >= 100
                  }
                  onValueChange={(id) => {
                    if (id !== null) updateDependencies([...task.blockedBy, id]);
                  }}
                >
                  <SelectTrigger size="sm" width="fluid" aria-label="Add blocker">
                    <SelectValue placeholder="Add blocker" />
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
            </aside>
            <section className="min-w-0 space-y-4 border-t border-border pt-4 md:col-start-1 md:row-start-2">
              <h2 className="text-sm font-semibold">Activity</h2>
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
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Add a comment
                  <Textarea
                    value={comment}
                    maxLength={TASK_TEXT_LIMIT}
                    aria-label="Comment"
                    placeholder="Handoff note"
                    disabled={disabled}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </label>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={disabled || !comment.trim()}
                  >
                    Post comment
                  </Button>
                </div>
              </form>
              {timeline.length > 0 ? (
                <ol aria-label="Task activity" className="divide-y divide-border/60">
                  {timeline.map((item) => (
                    <li
                      key={`${item.type}:${item.entry.id}`}
                      className="flex gap-2 py-2 first:pt-0"
                    >
                      {item.type === "comment" ? (
                        <MessageSquareIcon
                          aria-hidden="true"
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                        />
                      ) : (
                        <HistoryIcon
                          aria-hidden="true"
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                        />
                      )}
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
                        </div>
                        {item.type === "comment" ? (
                          <ChatMarkdown
                            text={item.entry.body}
                            cwd={workspaceRoot}
                            environmentId={environmentId}
                            headingLevelOffset={2}
                          />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Comments and changes to the task appear here.
                </p>
              )}
            </section>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
