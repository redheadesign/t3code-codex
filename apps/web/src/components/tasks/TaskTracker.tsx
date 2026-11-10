import { useAtomValue } from "@effect/atom-react";
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

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { taskWorkspaceCommand, taskWorkspaceRead } from "../../state/taskWorkspace";
import { useAtomCommand } from "../../state/use-atom-command";
import ChatMarkdown from "../ChatMarkdown";
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
import { BOARD_COLUMNS, TaskBoard } from "./TaskBoard";
import { TaskMobileNavigation, TasksWorkspace } from "./TasksWorkspace";

const TASK_VIEWS = [
  { id: "board", label: "Board", icon: Columns3Icon },
  { id: "archive", label: "Archive", icon: ArchiveIcon },
  { id: "wiki", label: "Wiki", icon: BookOpenIcon },
  { id: "jira", label: "Jira", icon: ListTodoIcon },
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

function TaskScopeSelect<Id extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Id | null;
  options: ReadonlyArray<{ id: Id; label: string }>;
  onChange: (id: Id) => void;
}) {
  return (
    <div className="min-w-0 flex-1 sm:max-w-56">
      <Select<Id>
        value={value}
        disabled={options.length === 0}
        onValueChange={(id) => {
          if (id !== null) onChange(id);
        }}
      >
        <SelectTrigger size="sm" width="fluid" aria-label={label}>
          <SelectValue placeholder={label}>
            {(id) => options.find((option) => option.id === id)?.label ?? label}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}

export function TaskTracker({ target }: { target: TasksSearch }) {
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projects = useProjects();
  const connected = environments.filter(
    (environment) =>
      environment.connection.phase === "connected" && environment.serverConfig !== null,
  );
  const environment =
    target.environmentId === undefined
      ? (connected.find((entry) => entry.environmentId === primaryEnvironmentId) ?? connected[0])
      : connected.find((entry) => entry.environmentId === target.environmentId);
  const environmentId = environment?.environmentId;
  const projectOptions = projects.filter(
    (entry) => entry.environmentId === environmentId && !entry.isScratch,
  );
  const project =
    target.projectId === undefined
      ? projectOptions[0]
      : projects.find(
          (entry) => entry.environmentId === environmentId && entry.id === target.projectId,
        );
  const projectId = project?.id;
  const scope = {
    ...(environmentId === undefined ? {} : { environmentId }),
    ...(projectId === undefined ? {} : { projectId }),
  };
  const view = target.view ?? (target.taskId === undefined ? "board" : "jira");

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      {...workspaceAreaProps("tasks", 0, "Tasks workspace")}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold">Tasks</h1>
          <ToggleGroup
            aria-label="Task views"
            value={[view]}
            onValueChange={([next]) => {
              const chosen = TASK_VIEWS.find((item) => item.id === next);
              if (chosen) void navigate({ to: "/tasks", search: { ...scope, view: chosen.id } });
            }}
          >
            {TASK_VIEWS.map(({ id, label, icon: Icon }) => (
              <ToggleGroupItem key={id} value={id}>
                <Icon />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {view !== "jira" ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-1 sm:justify-end">
            {connected.length > 1 || environment === undefined ? (
              <TaskScopeSelect
                label="Environment"
                value={environmentId ?? null}
                options={connected.map((entry) => ({
                  id: entry.environmentId,
                  label: entry.label,
                }))}
                onChange={(id) =>
                  void navigate({ to: "/tasks", search: { environmentId: id, view } })
                }
              />
            ) : null}
            <TaskScopeSelect
              label="Project"
              value={projectId ?? null}
              options={projectOptions.map((entry) => ({ id: entry.id, label: entry.title }))}
              onChange={(id) =>
                void navigate({ to: "/tasks", search: { ...scope, projectId: id, view } })
              }
            />
          </div>
        ) : null}
      </div>
      {view === "jira" ? (
        <TasksWorkspace target={target} />
      ) : environmentId !== undefined && project !== undefined ? (
        <LocalTaskTracker
          key={`${environmentId}:${project.id}`}
          environmentId={environmentId}
          projectId={project.id}
          workspaceRoot={project.workspaceRoot}
          projectTitle={project.title}
          view={view}
          target={target}
        />
      ) : (
        <p className="m-auto max-w-sm p-6 text-center text-sm text-muted-foreground">
          {environment === undefined
            ? "Select a connected environment to view tasks."
            : "Add or select a project to view its tasks."}
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
  projectTitle,
  view,
  target,
}: LocalTaskTarget & {
  projectTitle: string;
  view: Exclude<TaskView, "jira">;
  target: TasksSearch;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const query = useEnvironmentQuery(
    taskWorkspaceRead({
      environmentId,
      input: { environmentId, projectId, workspaceRoot, localOnly: true },
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
  const selectedTask = hasDetail
    ? tasks.find((task) =>
        target.localTaskId !== undefined
          ? task.id === target.localTaskId
          : task.threadId === target.threadId,
      )
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
        failure instanceof Error ? failure.message : "The task action could not be completed.",
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
      toastManager.add({ type: "success", title: "Task link copied" });
    } catch {
      toastManager.add({ type: "error", title: "Could not copy the task link" });
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
              Retry
            </Button>
          </>
        ) : query.isPending ? (
          <p role="status" className="flex items-center gap-2">
            <LoaderCircleIcon className="size-4 animate-spin" />
            Loading tasks…
          </p>
        ) : (
          <p>This environment does not support local tasks yet.</p>
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
          projectTitle={projectTitle}
          disabled={disabled}
          error={error}
          onSave={async (content) =>
            (await runCommand({ _tag: "updateProjectWiki", content })) !== null
          }
        />
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-6">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold wrap-anywhere">{projectTitle}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {view === "archive" ? "Completed tasks" : "Project board"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-36 flex-1 sm:w-48">
                <Input
                  type="search"
                  aria-label="Search project tasks"
                  placeholder="Search tasks"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </div>
              {view === "board" ? (
                <Button size="sm" disabled={disabled} onClick={() => showCreate("backlog")}>
                  <PlusIcon />
                  New task
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
              <DialogTitle>Task unavailable</DialogTitle>
              <DialogDescription>
                This task could not be found in the selected project.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button size="sm" variant="outline" onClick={closeTask}>
                Back to tasks
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
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Plan work before starting a chat.</DialogDescription>
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
              Title
              <Input
                required
                maxLength={TASK_TITLE_LIMIT}
                value={title}
                disabled={disabled}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Description
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
              <SelectTrigger size="sm" width="fluid" aria-label="Initial status">
                <SelectValue>
                  {(value) => BOARD_COLUMNS.find((column) => column.status === value)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {BOARD_COLUMNS.filter((entry) => entry.status !== "done").map((entry) => (
                  <SelectItem key={entry.status} value={entry.status}>
                    {entry.label}
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
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-local-task"
            size="sm"
            disabled={disabled || !title.trim()}
          >
            Create task
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
  projectTitle,
  disabled,
  error,
  onSave,
}: {
  content: string;
  workspaceRoot: string;
  environmentId: EnvironmentId;
  projectTitle: string;
  disabled: boolean;
  error: string | null;
  onSave: (content: string) => Promise<boolean>;
}) {
  const [edit, setEdit] = useState<{ base: string; draft: string } | null>(null);
  const changedElsewhere = edit !== null && edit.base !== content;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 md:px-6">
      <section className="max-w-3xl space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Project wiki</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{projectTitle}</p>
          </div>
          {edit === null ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => setEdit({ base: content, draft: content })}
            >
              <PencilIcon />
              Edit wiki
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
              Wiki content
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
                The wiki changed while you were editing. Copy your draft before reopening the latest
                version.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                type="submit"
                disabled={disabled || changedElsewhere || edit.draft === content}
              >
                Save wiki
              </Button>
              <Button size="sm" variant="ghost-muted" onClick={() => setEdit(null)}>
                Cancel
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
            Add project context, decisions, and handoff notes for people and agents.
          </p>
        )}
      </section>
    </div>
  );
}
