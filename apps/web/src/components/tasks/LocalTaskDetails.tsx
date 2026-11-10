import type {
  EnvironmentId,
  TaskWorkspaceBoardStatus,
  TaskWorkspaceBoardTask,
  TaskWorkspaceCommand,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { Link2Icon, MessageSquareIcon, PencilIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useUiText } from "~/i18n";

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
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { BOARD_COLUMNS, taskStatusLabel } from "./TaskBoard";
import { TaskFeedback } from "./TaskFeedback";
import { TaskHistory, TaskTimestamp } from "./TaskHistory";
import { TaskResources } from "./TaskResources";

export const TASK_TITLE_LIMIT = 256;
export const TASK_TEXT_LIMIT = 200_000;
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
  const text = useUiText();
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
                {text("Done", "Готово")}
              </Badge>
            ) : null}
            {onRemove ? (
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label={text(
                  `Remove dependency on ${task.title}`,
                  `Убрать зависимость от «${task.title}»`,
                )}
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
  const text = useUiText();
  const [view, setView] = useState<"overview" | "activity">("overview");
  const [edit, setEdit] = useState<{
    title: string;
    description: string;
    baseTitle: string;
    baseDescription: string;
  } | null>(null);
  const [owner, setOwner] = useState("");
  const dependencies = new Set(task.blockedBy);
  const byId = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  const chatTitles = new Map<string, string>();
  for (const candidate of tasks) {
    if (candidate.threadId !== null) chatTitles.set(candidate.threadId, candidate.title);
  }
  const blockers = task.blockedBy.map(
    (id) =>
      byId.get(id) ?? { id, title: text("Unavailable task", "Задача недоступна"), status: null },
  );
  const blocks = tasks.filter((candidate) => candidate.blockedBy.includes(task.id));
  const availableDependencies = tasks.filter(
    (candidate) => candidate.id !== task.id && !dependencies.has(candidate.id),
  );
  const isBlocked = blockers.some((candidate) => candidate.status !== "done");
  const canAssign = !disabled && !isBlocked && task.status !== "done";
  const StatusIcon = BOARD_COLUMNS.find(({ status }) => status === task.status)?.icon;
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
          <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3 pe-7">
            <div className="min-w-0 flex-1 basis-52 space-y-2">
              <DialogTitle>{task.title}</DialogTitle>
              <DialogDescription>
                {text("Created", "Создана")} <TaskTimestamp value={task.createdAt} />
                {isBlocked && task.status !== "done"
                  ? ` · ${text("Blocked", "Заблокирована")}`
                  : null}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
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
                  {task.status === "done"
                    ? text("Archived chat", "Чат в архиве")
                    : text("Open chat", "Открыть чат")}
                </Button>
              ) : task.status === "done" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    void onCommand({ _tag: "updateLocalTask", taskId: task.id, status: "todo" })
                  }
                >
                  <RotateCcwIcon />
                  {text("Reopen task", "Вернуть в работу")}
                </Button>
              ) : (
                <Button size="sm" disabled={disabled} onClick={() => onOpenChat(task.id)}>
                  <MessageSquareIcon />
                  {text("Start chat", "Запустить чат")}
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost-muted"
                aria-label={text("Copy task link", "Скопировать ссылку")}
                title={text("Copy task link", "Скопировать ссылку")}
                onClick={onCopyLink}
              >
                <Link2Icon />
              </Button>
            </div>
          </div>
          <div className="mt-2">
            <ToggleGroup
              aria-label={text("Task sections", "Разделы задачи")}
              value={[view]}
              onValueChange={([next]) => {
                if (next === "overview" || next === "activity") setView(next);
              }}
            >
              <ToggleGroupItem value="overview">{text("Overview", "Обзор")}</ToggleGroupItem>
              <ToggleGroupItem value="activity">{text("Activity", "Активность")}</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </DialogHeader>
        <DialogPanel>
          {error ? (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          ) : null}
          <div className="grid items-start gap-6 border-t border-border pt-4 md:grid-cols-[minmax(0,1fr)_14rem]">
            <section hidden={view !== "overview"} className="min-w-0 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{text("Description", "Описание")}</h2>
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
                    {text("Edit task", "Редактировать")}
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
                    {text("Title", "Название")}
                    <Input
                      value={edit.title}
                      maxLength={TASK_TITLE_LIMIT}
                      disabled={disabled}
                      onChange={(event) => setEdit({ ...edit, title: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    {text("Description", "Описание")}
                    <Textarea
                      value={edit.description}
                      maxLength={TASK_TEXT_LIMIT}
                      disabled={disabled}
                      onChange={(event) => setEdit({ ...edit, description: event.target.value })}
                    />
                  </label>
                  {editStale ? (
                    <p role="alert" className="text-sm text-warning-foreground">
                      {text(
                        "This task changed while you were editing. Copy your draft before reopening the latest version.",
                        "Задача обновилась. Скопируйте свой черновик, прежде чем открыть свежую версию.",
                      )}
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={disabled || editStale || !edit.title.trim()}
                    >
                      {text("Save changes", "Сохранить изменения")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost-muted"
                      disabled={disabled}
                      onClick={() => setEdit(null)}
                    >
                      {text("Cancel", "Отмена")}
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
                  {text(
                    "Add the goal, relevant links, and how to tell when the work is done.",
                    "Опишите цель, добавьте ссылки и укажите, как проверить результат.",
                  )}
                </p>
              )}
              <TaskResources
                task={task}
                environmentId={environmentId}
                workspaceRoot={workspaceRoot}
                disabled={disabled}
                onCommand={onCommand}
              />
            </section>
            <div hidden={view !== "activity"} className="min-w-0 space-y-5">
              <TaskFeedback
                task={task}
                environmentId={environmentId}
                workspaceRoot={workspaceRoot}
                disabled={disabled}
                chatTitles={chatTitles}
                onCommand={onCommand}
              />
              <TaskHistory
                task={task}
                environmentId={environmentId}
                workspaceRoot={workspaceRoot}
              />
            </div>
            <aside
              aria-label={text("Task properties", "Свойства задачи")}
              className="min-w-0 space-y-4 border-t border-border pt-4 md:border-s md:border-t-0 md:ps-4 md:pt-0"
            >
              <h2 className="text-sm font-semibold">{text("Properties", "Свойства")}</h2>
              <div className="space-y-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {text("Status", "Статус")}
                </h3>
                <Select<TaskWorkspaceBoardStatus>
                  value={task.status}
                  disabled={disabled}
                  onValueChange={(status) => {
                    if (status !== null && status !== task.status)
                      void onCommand({ _tag: "updateLocalTask", taskId: task.id, status });
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    width="fluid"
                    aria-label={text("Task status", "Статус задачи")}
                  >
                    {StatusIcon ? <StatusIcon aria-hidden /> : null}
                    <SelectValue>{(status) => taskStatusLabel(status, text)}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {BOARD_COLUMNS.filter(
                      (column) => column.status !== "backlog" || task.threadId === null,
                    ).map(({ status }) => (
                      <SelectItem key={status} value={status}>
                        {taskStatusLabel(status, text)}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {text("Assignee", "Исполнитель")}
                </h3>
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
                        {text("Release", "Снять назначение")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {text("Claimed", "Назначен")} <TaskTimestamp value={task.claim.claimedAt} />
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
                    <p className="text-sm">{text("Unassigned", "Не назначен")}</p>
                    {isBlocked && task.status !== "done" ? (
                      <p className="text-xs text-muted-foreground">
                        {text(
                          "Resolve the blockers to assign the task.",
                          "Сначала завершите блокирующие задачи.",
                        )}
                      </p>
                    ) : null}
                    {task.status !== "done" && !isBlocked ? (
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <Input
                            size="sm"
                            value={owner}
                            maxLength={TASK_TITLE_LIMIT}
                            aria-label={text("Assignee name", "Имя исполнителя")}
                            placeholder={text("Name", "Имя")}
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
                          {text("Assign", "Назначить")}
                        </Button>
                      </div>
                    ) : null}
                  </form>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {text("Dependencies", "Зависимости")}
                </h3>
                <TaskLinks
                  label={text("Blocked by", "Блокируют")}
                  tasks={blockers}
                  disabled={disabled}
                  onOpen={onSelect}
                  onRemove={(id) =>
                    updateDependencies(task.blockedBy.filter((dependency) => dependency !== id))
                  }
                />
                <TaskLinks
                  label={text("Blocking", "Блокирует")}
                  tasks={blocks}
                  disabled={disabled}
                  onOpen={onSelect}
                />
                {blockers.length === 0 && blocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {text("No linked tasks", "Нет связанных задач")}
                  </p>
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
                  <SelectTrigger
                    size="sm"
                    width="fluid"
                    aria-label={text("Add blocker", "Добавить зависимость")}
                  >
                    <SelectValue placeholder={text("Add blocker", "Добавить зависимость")} />
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
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
