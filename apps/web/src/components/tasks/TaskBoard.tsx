import type { TaskWorkspaceBoardStatus, TaskWorkspaceBoardTask } from "@t3tools/contracts";
import {
  ArchiveIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  CirclePlayIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  PlayIcon,
  PlusIcon,
} from "lucide-react";
import { useState, type DragEvent } from "react";
import { useUiText } from "~/i18n";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { pendingTaskFeedback } from "./taskFeedbackBatch";

export const BOARD_COLUMNS = [
  {
    status: "backlog",
    label: "Backlog",
    ru: "Бэклог",
    icon: CircleDashedIcon,
    tone: "text-muted-foreground",
  },
  {
    status: "todo",
    label: "To do",
    ru: "К выполнению",
    icon: CircleIcon,
    tone: "text-muted-foreground",
  },
  {
    status: "inProgress",
    label: "In progress",
    ru: "В работе",
    icon: CirclePlayIcon,
    tone: "text-info-foreground",
  },
  {
    status: "review",
    label: "In review",
    ru: "На проверке",
    icon: CircleDotIcon,
    tone: "text-warning-foreground",
  },
  {
    status: "done",
    label: "Done",
    ru: "Готово",
    icon: CircleCheckIcon,
    tone: "text-success-foreground",
  },
] as const satisfies ReadonlyArray<{
  status: TaskWorkspaceBoardStatus;
  label: string;
  ru: string;
  icon: typeof CircleIcon;
  tone: string;
}>;

export function taskStatusLabel(status: unknown, text: ReturnType<typeof useUiText>) {
  const column = BOARD_COLUMNS.find((entry) => entry.status === status);
  return column ? text(column.label, column.ru) : "";
}

const TASK_DRAG_TYPE = "application/x-t3-board-task";
const LINKED_TASK_DRAG_TYPE = "application/x-t3-board-linked-task";
const COUNTS = { en: new Intl.NumberFormat("en"), ru: new Intl.NumberFormat("ru") };

function TaskCard({
  task,
  blocked,
  canMove,
  onOpen,
  onSendFeedback,
}: {
  task: TaskWorkspaceBoardTask;
  blocked: boolean;
  canMove: boolean;
  onOpen: (taskId: string) => void;
  onSendFeedback: (taskId: string, commentIds: ReadonlyArray<string>) => void;
}) {
  const text = useUiText();
  const batch = pendingTaskFeedback(task.comments);
  const showPlay =
    task.threadId !== null &&
    task.status !== "done" &&
    batch.count > 1 &&
    batch.commentIds.length > 0;
  const commentCount = (text("en", "ru") === "ru" ? COUNTS.ru : COUNTS.en).format(
    task.comments.length,
  );
  return (
    <li className="relative">
      <button
        type="button"
        className={cn(
          "flex w-full flex-col gap-2 rounded-lg border border-border/70 bg-card p-3 text-start hover:border-border hover:bg-interactive-row-hover focus-visible:outline-2 focus-visible:outline-ring",
          canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          showPlay && "pe-14",
        )}
        draggable={canMove}
        onDragStart={(event) => {
          if (!canMove) return;
          event.dataTransfer.setData(
            task.threadId === null ? TASK_DRAG_TYPE : LINKED_TASK_DRAG_TYPE,
            task.id,
          );
          event.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => onOpen(task.id)}
      >
        <span className="text-sm leading-snug font-medium wrap-anywhere">{task.title}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {task.threadId !== null ? (
            <span className="inline-flex items-center gap-1">
              <MessageSquareIcon aria-hidden className="size-3.5" />
              {text("Chat", "Чат")}
            </span>
          ) : null}
          {blocked ? (
            <Badge variant="warning" size="sm">
              {text("Blocked", "Заблокирована")}
            </Badge>
          ) : null}
          {task.claim !== null ? (
            <span className="min-w-0 wrap-anywhere">{task.claim.owner}</span>
          ) : null}
          {task.comments.length > 0 ? (
            <span
              className="inline-flex items-center gap-1"
              aria-label={text(`Comments: ${commentCount}`, `Комментарии: ${commentCount}`)}
            >
              <MessageCircleIcon aria-hidden className="size-3.5" />
              {commentCount}
            </span>
          ) : null}
        </span>
      </button>
      {showPlay ? (
        <div className="absolute end-1.5 top-1.5">
          <Button
            size="xs"
            variant="ghost-muted"
            disabled={!canMove}
            aria-label={text(
              `Send feedback for ${task.title}`,
              `Отправить замечания по задаче «${task.title}»`,
            )}
            onClick={() => onSendFeedback(task.id, batch.commentIds)}
          >
            <PlayIcon />
            {batch.commentIds.length}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function TaskBoard({
  tasks,
  archived,
  filter,
  canMove,
  onOpen,
  onCreate,
  onMove,
  onSendFeedback,
}: {
  tasks: ReadonlyArray<TaskWorkspaceBoardTask>;
  archived: boolean;
  filter: string;
  canMove: boolean;
  onOpen: (taskId: string) => void;
  onCreate: (status: TaskWorkspaceBoardStatus) => void;
  onMove: (taskId: string, status: TaskWorkspaceBoardStatus) => void;
  onSendFeedback: (taskId: string, commentIds: ReadonlyArray<string>) => void;
}) {
  const text = useUiText();
  const counts = text("en", "ru") === "ru" ? COUNTS.ru : COUNTS.en;
  const [over, setOver] = useState<TaskWorkspaceBoardStatus | null>(null);
  const needle = filter.trim().toLocaleLowerCase();
  const grouped = new Map<TaskWorkspaceBoardStatus, TaskWorkspaceBoardTask[]>();
  const byId = new Map<string, TaskWorkspaceBoardTask>();
  for (const task of tasks) {
    byId.set(task.id, task);
    if (needle && !`${task.title} ${task.claim?.owner ?? ""}`.toLocaleLowerCase().includes(needle))
      continue;
    const group = grouped.get(task.status) ?? [];
    group.push(task);
    grouped.set(task.status, group);
  }
  const columns = BOARD_COLUMNS.filter((column) => (column.status === "done") === archived);
  const acceptsDrop = (event: DragEvent<HTMLElement>, status: TaskWorkspaceBoardStatus) =>
    canMove &&
    (event.dataTransfer.types.includes(TASK_DRAG_TYPE) ||
      (status !== "backlog" && event.dataTransfer.types.includes(LINKED_TASK_DRAG_TYPE)));
  const dropHandlers = (status: TaskWorkspaceBoardStatus) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!acceptsDrop(event, status)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setOver(status);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
        return;
      setOver((current) => (current === status ? null : current));
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      setOver(null);
      if (!acceptsDrop(event, status)) return;
      event.preventDefault();
      const task = byId.get(
        event.dataTransfer.getData(TASK_DRAG_TYPE) ||
          event.dataTransfer.getData(LINKED_TASK_DRAG_TYPE),
      );
      if (task !== undefined && task.status !== status) onMove(task.id, status);
    },
  });

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:px-6"
      onDragEnd={() => setOver(null)}
    >
      {!archived ? (
        <div
          className={cn(
            "mb-4 flex items-center justify-end gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground",
            over === "done" && "bg-accent text-foreground ring-1 ring-ring",
          )}
          {...dropHandlers("done")}
        >
          <ArchiveIcon aria-hidden className="size-3.5" />
          {text("Drop here to archive", "Перетащите задачу сюда, чтобы отправить в архив")}
        </div>
      ) : null}
      <div
        className={cn(
          "grid min-h-0 content-start gap-4",
          archived ? "max-w-2xl" : "sm:grid-cols-2 xl:grid-cols-4",
        )}
      >
        {columns.map(({ status, label, ru, icon: Icon, tone }) => {
          const localizedLabel = text(label, ru);
          const cards = grouped.get(status) ?? [];
          return (
            <section
              key={status}
              aria-label={localizedLabel}
              className={cn(
                "min-h-28 min-w-0 rounded-lg bg-muted/25 p-2",
                !archived && "xl:min-h-64",
                over === status && "bg-accent/65 ring-1 ring-ring",
              )}
              {...dropHandlers(status)}
            >
              <div className="mb-2 flex min-h-8 items-center gap-2 px-1">
                <Icon aria-hidden className={cn("size-4 shrink-0", tone)} />
                <h2 className="text-sm font-medium">{localizedLabel}</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {counts.format(cards.length)}
                </span>
                {!archived && status !== "review" ? (
                  <div className="ms-auto">
                    <Button
                      size="icon-xs"
                      variant="ghost-muted"
                      aria-label={text(`New task in ${label}`, `Добавить задачу в «${ru}»`)}
                      disabled={!canMove}
                      onClick={() => onCreate(status)}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                ) : null}
              </div>
              {cards.length > 0 ? (
                <ul className="space-y-2">
                  {cards.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      blocked={task.blockedBy.some((id) => byId.get(id)?.status !== "done")}
                      canMove={canMove && !archived}
                      onOpen={onOpen}
                      onSendFeedback={onSendFeedback}
                    />
                  ))}
                </ul>
              ) : (
                <p className="p-3 text-xs text-muted-foreground">
                  {needle
                    ? text("No matching tasks", "Ничего не найдено")
                    : archived
                      ? text("Completed tasks will appear here", "Здесь будут завершённые задачи")
                      : text("No tasks", "Нет задач")}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
