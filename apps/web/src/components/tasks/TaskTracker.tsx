import { useAtomValue } from "@effect/atom-react";
import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ProjectId,
  TaskWorkspaceBoard,
  TaskWorkspaceBoardStatus,
  TaskWorkspaceCommand,
  ThreadId,
} from "@t3tools/contracts";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArchiveIcon,
  BookOpenIcon,
  Columns3Icon,
  ListTodoIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useUiText } from "~/i18n";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { taskWorkspaceCommand, taskWorkspaceRead } from "../../state/taskWorkspace";
import { useAtomCommand } from "../../state/use-atom-command";
import ChatMarkdown from "../ChatMarkdown";
import { ProjectFavicon } from "../ProjectFavicon";
import { ProjectPicker } from "../ProjectPicker";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { LocalTaskDetails, TASK_TEXT_LIMIT, TASK_TITLE_LIMIT } from "./LocalTaskDetails";
import { BOARD_COLUMNS, TaskBoard, taskStatusLabel } from "./TaskBoard";
import { TaskIdeaComposer } from "./TaskIdeaComposer";
import { TaskMobileNavigation, TasksWorkspace } from "./TasksWorkspace";

const TASK_VIEWS = [
  { id: "board", label: "Board", ru: "Доска", icon: Columns3Icon },
  { id: "archive", label: "Archive", ru: "Архив", icon: ArchiveIcon },
  { id: "wiki", label: "Wiki", ru: "Вики", icon: BookOpenIcon },
  { id: "jira", label: "Jira", ru: "Jira", icon: ListTodoIcon },
] as const;

type TaskView = (typeof TASK_VIEWS)[number]["id"];

export type TasksSearch = {
  readonly environmentId?: EnvironmentId;
  readonly projectId?: ProjectId;
  readonly taskId?: string;
  readonly localTaskId?: string;
  readonly threadId?: ThreadId;
  readonly view?: TaskView;
};

type LocalTaskTarget = {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  workspaceRoot: string;
};

export function TaskTracker({ target }: { target: TasksSearch }) {
  const text = useUiText();
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projects = useProjects();
  const connected = environments.filter(
    (environment) =>
      environment.connection.phase === "connected" && environment.serverConfig !== null,
  );
  const connectedById = new Map(
    connected.map((environment) => [environment.environmentId, environment]),
  );
  const projectOptions = projects.filter(
    (project) => !project.isScratch && connectedById.has(project.environmentId),
  );
  const defaultEnvironment =
    connected.find((entry) => entry.environmentId === primaryEnvironmentId) ?? connected[0];
  const environment =
    target.environmentId === undefined
      ? defaultEnvironment
      : connectedById.get(target.environmentId);
  const defaultProject = projectOptions.find(
    (entry) => entry.environmentId === environment?.environmentId,
  );
  const project =
    target.projectId === undefined
      ? (defaultProject ?? (target.environmentId === undefined ? projectOptions[0] : undefined))
      : projects.find(
          (entry) =>
            entry.environmentId === environment?.environmentId && entry.id === target.projectId,
        );
  const environmentId = project?.environmentId ?? environment?.environmentId;
  const pickerItems = projectOptions.map((entry) => {
    const environmentLabel = connectedById.get(entry.environmentId)?.label ?? entry.environmentId;
    return {
      value: scopedProjectKey(scopeProjectRef(entry.environmentId, entry.id)),
      label: entry.title,
      searchText: `${entry.title} ${environmentLabel}`,
      environmentLabel,
      project: entry,
    };
  });
  const selectedValue = project
    ? scopedProjectKey(scopeProjectRef(project.environmentId, project.id))
    : undefined;
  const projectId = project?.id;
  const scope = {
    ...(environmentId === undefined ? {} : { environmentId }),
    ...(projectId === undefined ? {} : { projectId }),
  };
  const view = target.view ?? (target.taskId === undefined ? "board" : "jira");

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      {...workspaceAreaProps("tasks", 0, text("Tasks workspace", "Задачи"))}
    >
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/70 px-4 py-3 md:px-6">
        <h1 className="sr-only">{text("Tasks", "Задачи")}</h1>
        <div className="flex min-w-0 max-w-full items-center text-sm font-medium sm:max-w-72">
          <ProjectPicker
            items={pickerItems}
            selectedValue={selectedValue}
            title={project?.title ?? text("Choose a project", "Выберите проект")}
            titleIcon={project ? <ProjectFavicon project={project} className="size-full" /> : null}
            titleTooltip={project?.title}
            ariaLabel={
              project
                ? text(`Project: ${project.title}`, `Проект: ${project.title}`)
                : text("Choose a project", "Выбрать проект")
            }
            onSelect={(item) => {
              if (item.value === selectedValue) return;
              void navigate({
                to: "/tasks",
                search: {
                  environmentId: item.project.environmentId,
                  projectId: item.project.id,
                  view,
                },
              });
            }}
            renderIcon={(item) => (
              <ProjectFavicon project={item.project} className="size-4 shrink-0" />
            )}
            renderTrailing={
              connected.length > 1
                ? (item) => (
                    <span className="max-w-24 shrink-0 truncate text-xs text-muted-foreground">
                      {item.environmentLabel}
                    </span>
                  )
                : undefined
            }
          />
        </div>
        <ToggleGroup
          aria-label={text("Task views", "Разделы задач")}
          value={[view]}
          onValueChange={([next]) => {
            const chosen = TASK_VIEWS.find((item) => item.id === next);
            if (chosen) void navigate({ to: "/tasks", search: { ...scope, view: chosen.id } });
          }}
        >
          {TASK_VIEWS.map(({ id, label, ru, icon: Icon }) => (
            <ToggleGroupItem key={id} value={id}>
              <Icon />
              {text(label, ru)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {view === "jira" ? (
        <TasksWorkspace target={{ ...target, ...scope }} scopeInHeader />
      ) : environmentId !== undefined && project !== undefined ? (
        <LocalTaskTracker
          key={`${environmentId}:${project.id}`}
          environmentId={environmentId}
          projectId={project.id}
          workspaceRoot={project.workspaceRoot}
          view={view}
          target={target}
        />
      ) : (
        <p className="m-auto max-w-sm p-6 text-center text-sm text-muted-foreground">
          {environment === undefined
            ? text(
                "Select a connected environment to view tasks.",
                "Чтобы увидеть задачи, подключитесь к рабочей среде.",
              )
            : text(
                "Add or select a project to view its tasks.",
                "Добавьте или выберите проект, чтобы увидеть задачи.",
              )}
        </p>
      )}
      {view !== "jira" ? <TaskMobileNavigation {...scope} /> : null}
    </div>
  );
}

function LocalTaskTracker({
  environmentId,
  projectId,
  workspaceRoot,
  view,
  target,
}: LocalTaskTarget & {
  view: Exclude<TaskView, "jira">;
  target: TasksSearch;
}) {
  const text = useUiText();
  const navigate = useNavigate();
  const router = useRouter();
  const query = useEnvironmentQuery(
    taskWorkspaceRead({
      environmentId,
      input: {
        environmentId,
        projectId,
        workspaceRoot,
        localOnly: true,
        ...(target.localTaskId ? { taskId: target.localTaskId } : {}),
        ...(target.threadId ? { threadId: target.threadId } : {}),
      },
    }),
  );
  const { refresh } = query;
  const execute = useAtomCommand(taskWorkspaceCommand, {
    label: "local task action",
    reportFailure: false,
  });
  const canCommand = useAtomValue(taskWorkspaceCommand.permissionAtom(environmentId));
  const [lastWrite, setLastWrite] = useState<TaskWorkspaceBoard | null>(null);
  const [pending, setPending] = useState(false);
  const writing = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [newStatus, setNewStatus] = useState<TaskWorkspaceBoardStatus | null>(null);
  const fromServer = query.data?.board ?? null;
  const board =
    lastWrite !== null && (fromServer === null || fromServer.revision < lastWrite.revision)
      ? lastWrite
      : fromServer;
  const tasks = board?.tasks ?? [];
  const hasDetail =
    view !== "wiki" && (target.localTaskId !== undefined || target.threadId !== undefined);
  const selectedBoardTask = hasDetail
    ? tasks.find((task) =>
        target.localTaskId !== undefined
          ? task.id === target.localTaskId
          : task.threadId === target.threadId,
      )
    : undefined;
  const selectedContext = fromServer?.tasks.find((task) => task.id === selectedBoardTask?.id);
  const selectedTask = selectedBoardTask
    ? {
        ...selectedBoardTask,
        ...(selectedContext?.initialBrief !== undefined
          ? { initialBrief: selectedContext.initialBrief }
          : {}),
        ...(selectedContext?.threadHistory !== undefined
          ? { threadHistory: selectedContext.threadHistory }
          : {}),
      }
    : undefined;
  const disabled = !canCommand || pending;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the server read sends a snapshot, so refresh when a visible board can have changed externally
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refreshVisible();
    document.addEventListener("visibilitychange", refreshVisible);
    const timer = window.setInterval(refreshVisible, 10_000);
    return () => {
      document.removeEventListener("visibilitychange", refreshVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const runCommand = async (command: TaskWorkspaceCommand) => {
    if (board === null || !canCommand || writing.current) return null;
    writing.current = true;
    setPending(true);
    setError(null);
    const result = await execute({
      environmentId,
      input: { environmentId, projectId, workspaceRoot, revision: board.revision, command },
    });
    writing.current = false;
    setPending(false);
    if (result._tag === "Failure") {
      const failure = squashAtomCommandFailure(result);
      setError(
        failure instanceof Error
          ? failure.message
          : text(
              "The task action could not be completed.",
              "Не удалось выполнить действие с задачей.",
            ),
      );
      query.refresh();
      return null;
    }
    const updated = result.value.board ?? null;
    setLastWrite(updated);
    query.refresh();
    return updated;
  };
  const openTask = (localTaskId: string) => {
    setError(null);
    void navigate({ to: "/tasks", search: { environmentId, projectId, view, localTaskId } });
  };
  const closeTask = () => {
    setError(null);
    void navigate({ to: "/tasks", search: { environmentId, projectId, view } });
  };
  const openChat = async (taskId: string) => {
    const result = await runCommand({ _tag: "openLocalTask", taskId });
    const threadId = result?.tasks.find((task) => task.id === taskId)?.threadId;
    if (threadId)
      await navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
  };
  const copyTaskLink = async (localTaskId: string) => {
    const location = router.buildLocation({
      to: "/tasks",
      search: { environmentId, projectId, view, localTaskId },
    });
    const url = new URL(router.history.createHref(location.publicHref), window.location.href).href;
    try {
      await writeTextToClipboard(url, "task link");
      toastManager.add({
        type: "success",
        title: text("Task link copied", "Ссылка на задачу скопирована"),
      });
    } catch {
      toastManager.add({
        type: "error",
        title: text("Could not copy the task link", "Не удалось скопировать ссылку на задачу"),
      });
    }
  };
  const showCreate = (status: TaskWorkspaceBoardStatus) => {
    setError(null);
    setNewStatus(status);
  };
  if (board === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
        {query.error ? (
          <>
            <p role="alert">{query.error}</p>
            <Button size="sm" variant="outline" onClick={query.refresh}>
              {text("Retry", "Повторить")}
            </Button>
          </>
        ) : query.isPending ? (
          <p role="status" className="flex items-center gap-2">
            <LoaderCircleIcon className="size-4 animate-spin" />
            {text("Loading tasks…", "Загружаем задачи…")}
          </p>
        ) : (
          <p>
            {text(
              "This environment does not support local tasks yet.",
              "Эта рабочая среда пока не поддерживает локальные задачи.",
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-14 md:pb-0">
      {view === "wiki" ? (
        <ProjectWiki
          content={board.wiki.content}
          environmentId={environmentId}
          workspaceRoot={workspaceRoot}
          disabled={disabled}
          error={error}
          onSave={async (content) =>
            (await runCommand({ _tag: "updateProjectWiki", content })) !== null
          }
        />
      ) : (
        <>
          {view === "board" ? (
            <TaskIdeaComposer
              environmentId={environmentId}
              projectId={projectId}
              threadId={board.intakeThreadId}
              disabled={disabled}
              onSend={async (submission) =>
                (await runCommand({ _tag: "submitLocalTaskIdeas", ...submission })) !== null
              }
            />
          ) : null}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-6">
            <h2 className="text-sm font-medium">
              {view === "archive"
                ? text("Completed tasks", "Завершённые задачи")
                : text("Board", "Доска")}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-36 flex-1 sm:w-48">
                <Input
                  type="search"
                  aria-label={text("Search project tasks", "Поиск по задачам проекта")}
                  placeholder={text("Search tasks", "Поиск задач")}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </div>
              {view === "board" ? (
                <Button size="sm" disabled={disabled} onClick={() => showCreate("backlog")}>
                  <PlusIcon />
                  {text("New task", "Новая задача")}
                </Button>
              ) : null}
            </div>
          </div>
          {error && selectedTask === undefined && newStatus === null ? (
            <p role="alert" className="mx-4 mt-3 text-sm text-destructive-foreground md:mx-6">
              {error}
            </p>
          ) : null}
          <TaskBoard
            tasks={tasks}
            archived={view === "archive"}
            filter={filter}
            canMove={!disabled}
            onOpen={openTask}
            onCreate={showCreate}
            onSendFeedback={(taskId, commentIds) =>
              void runCommand({ _tag: "sendLocalTaskFeedback", taskId, commentIds })
            }
            onMove={(taskId, status) =>
              void runCommand({ _tag: "updateLocalTask", taskId, status })
            }
          />
        </>
      )}
      {selectedTask ? (
        <LocalTaskDetails
          key={selectedTask.id}
          task={selectedTask}
          tasks={tasks}
          environmentId={environmentId}
          workspaceRoot={workspaceRoot}
          disabled={disabled}
          error={error}
          onClose={closeTask}
          onSelect={openTask}
          onCopyLink={() => void copyTaskLink(selectedTask.id)}
          onOpenChat={(taskId) => void openChat(taskId)}
          onCommand={async (command) => (await runCommand(command)) !== null}
        />
      ) : hasDetail && !query.isPending ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) closeTask();
          }}
        >
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>{text("Task unavailable", "Задача недоступна")}</DialogTitle>
              <DialogDescription>
                {text(
                  "This task could not be found in the selected project.",
                  "В выбранном проекте нет такой задачи.",
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button size="sm" variant="outline" onClick={closeTask}>
                {text("Back to tasks", "Вернуться к задачам")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      ) : null}
      {newStatus !== null && view === "board" ? (
        <NewTaskDialog
          initialStatus={newStatus}
          disabled={disabled}
          error={error}
          onClose={() => {
            setError(null);
            setNewStatus(null);
          }}
          onCreate={async (title, description, status) => {
            if (
              (await runCommand({ _tag: "createLocalTask", title, description, status })) !== null
            )
              setNewStatus(null);
          }}
        />
      ) : null}
    </div>
  );
}

function NewTaskDialog({
  initialStatus,
  disabled,
  error,
  onClose,
  onCreate,
}: {
  initialStatus: TaskWorkspaceBoardStatus;
  disabled: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (title: string, description: string, status: TaskWorkspaceBoardStatus) => Promise<void>;
}) {
  const text = useUiText();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(initialStatus);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{text("New task", "Новая задача")}</DialogTitle>
          <DialogDescription>
            {text(
              "Plan work before starting a chat.",
              "Задачу можно создать заранее и открыть чат позже.",
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id="new-local-task"
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim() && !disabled) void onCreate(title.trim(), description, status);
            }}
          >
            <label className="grid gap-1 text-sm">
              {text("Title", "Название")}
              <Input
                required
                maxLength={TASK_TITLE_LIMIT}
                value={title}
                disabled={disabled}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              {text("Description", "Описание")}
              <Textarea
                maxLength={TASK_TEXT_LIMIT}
                value={description}
                disabled={disabled}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <Select<TaskWorkspaceBoardStatus>
              value={status}
              disabled={disabled}
              onValueChange={(value) => {
                if (value !== null) setStatus(value);
              }}
            >
              <SelectTrigger
                size="sm"
                width="fluid"
                aria-label={text("Initial status", "Начальный статус")}
              >
                <SelectValue>{(value) => (value ? taskStatusLabel(value, text) : "")}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {BOARD_COLUMNS.filter((entry) => entry.status !== "done").map((entry) => (
                  <SelectItem key={entry.status} value={entry.status}>
                    {taskStatusLabel(entry.status, text)}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            {error ? (
              <p role="alert" className="text-sm text-destructive-foreground">
                {error}
              </p>
            ) : null}
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button size="sm" variant="ghost-muted" onClick={onClose}>
            {text("Cancel", "Отмена")}
          </Button>
          <Button
            type="submit"
            form="new-local-task"
            size="sm"
            disabled={disabled || !title.trim()}
          >
            {text("Create task", "Создать задачу")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ProjectWiki({
  content,
  workspaceRoot,
  environmentId,
  disabled,
  error,
  onSave,
}: {
  content: string;
  workspaceRoot: string;
  environmentId: EnvironmentId;
  disabled: boolean;
  error: string | null;
  onSave: (content: string) => Promise<boolean>;
}) {
  const text = useUiText();
  const [edit, setEdit] = useState<{ base: string; draft: string } | null>(null);
  const changedElsewhere = edit !== null && edit.base !== content;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 md:px-6">
      <section className="max-w-3xl space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{text("Project wiki", "Вики проекта")}</h2>
          {edit === null ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => setEdit({ base: content, draft: content })}
            >
              <PencilIcon />
              {text("Edit wiki", "Редактировать")}
            </Button>
          ) : null}
        </header>
        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {edit !== null ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled && !changedElsewhere)
                void onSave(edit.draft).then((saved) => {
                  if (saved) setEdit(null);
                });
            }}
          >
            <label className="grid gap-1 text-sm">
              {text("Wiki content", "Содержимое вики")}
              <Textarea
                size="lg"
                value={edit.draft}
                maxLength={TASK_TEXT_LIMIT}
                disabled={disabled}
                onChange={(event) => setEdit({ ...edit, draft: event.target.value })}
              />
            </label>
            {changedElsewhere ? (
              <p role="alert" className="text-sm text-warning-foreground">
                {text(
                  "The wiki changed while you were editing. Copy your draft before reopening the latest version.",
                  "Вики обновилась. Скопируйте свой черновик, прежде чем открыть свежую версию.",
                )}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                type="submit"
                disabled={disabled || changedElsewhere || edit.draft === content}
              >
                {text("Save wiki", "Сохранить")}
              </Button>
              <Button size="sm" variant="ghost-muted" onClick={() => setEdit(null)}>
                {text("Cancel", "Отмена")}
              </Button>
            </div>
          </form>
        ) : content ? (
          <ChatMarkdown
            text={content}
            cwd={workspaceRoot}
            environmentId={environmentId}
            headingLevelOffset={2}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {text(
              "Add project context, decisions, and handoff notes for people and agents.",
              "Добавляйте контекст проекта, решения и заметки для передачи работы.",
            )}
          </p>
        )}
      </section>
    </div>
  );
}
