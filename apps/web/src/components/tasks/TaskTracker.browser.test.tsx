import {
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ServerProvider,
  type TaskWorkspaceBoard,
  type TaskWorkspaceCommandInput,
  type TaskWorkspaceSnapshot,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS, DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts/settings";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { act, render } from "../../../test/render";
import { TaskTracker } from "./TaskTracker";

const environmentId = EnvironmentId.make("laptop");
const projectId = ProjectId.make("project");
const remoteEnvironmentId = EnvironmentId.make("remote");
const remoteProjectId = ProjectId.make("mobile");
const threadId = ThreadId.make("thread");
const ideasThreadId = ThreadId.make("ideas-thread");
const timestamp = "2026-11-10T08:00:00.000Z";
const scope = { environmentId, projectId };
const modelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" };
const provider: ServerProvider = {
  instanceId: modelSelection.instanceId,
  driver: ProviderDriverKind.make("codex"),
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: timestamp,
  models: [{ slug: modelSelection.model, name: "GPT-5.4", isCustom: false, capabilities: null }],
  slashCommands: [],
  skills: [],
};
const board: TaskWorkspaceBoard = {
  revision: 1,
  wiki: { content: "", updatedAt: null },
  tasks: [
    {
      id: "task-1",
      title: "Review mobile navigation",
      description: "",
      status: "todo",
      threadId,
      claim: null,
      blockedBy: [],
      comments: [
        {
          id: "handoff",
          author: "Designer",
          body: "Navigation is ready for review.",
          source: "user",
          createdAt: "2026-11-10T08:05:00.000Z",
        },
      ],
      activity: [
        {
          id: "created",
          kind: "created",
          author: "Designer",
          description: "Created task",
          createdAt: timestamp,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
};
const snapshot: TaskWorkspaceSnapshot = {
  revision: 0,
  configured: false,
  connection: {
    configured: false,
    url: null,
    username: null,
    secretConfigured: false,
    projectKeys: [],
    secretRef: null,
  },
  assignee: null,
  sprints: [],
  tasks: [],
  lastSyncedAt: null,
  error: null,
  board,
};

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  command: vi.fn(),
  refresh: vi.fn(),
  data: null as TaskWorkspaceSnapshot | null,
}));

function setup(data = snapshot) {
  fixture.data = data;
  fixture.navigate.mockReset();
  fixture.refresh.mockReset();
  fixture.command
    .mockReset()
    .mockImplementation(async ({ input }: { input: TaskWorkspaceCommandInput }) => {
      const { command } = input;
      const currentBoard = data.board ?? board;
      const tasks = currentBoard.tasks.map((task) => {
        if (
          command._tag === "updateLocalTask" &&
          command.status !== undefined &&
          task.id === command.taskId
        )
          return { ...task, status: command.status };
        if (command._tag === "sendLocalTaskFeedback" && task.id === command.taskId)
          return {
            ...task,
            comments: task.comments.map((entry) =>
              command.commentIds.includes(entry.id)
                ? { ...entry, feedback: { status: "sent" as const } }
                : entry,
            ),
          };
        return task;
      });
      return AsyncResult.success({
        ...data,
        board: {
          ...currentBoard,
          revision: 2,
          tasks,
          ...(command._tag === "submitLocalTaskIdeas" ? { intakeThreadId: ideasThreadId } : {}),
        },
      });
    });
}

vi.mock(import("@tanstack/react-router"), async (original) => ({
  ...(await original()),
  useNavigate: () => fixture.navigate,
}));
vi.mock(import("@effect/atom-react"), async (original) => ({
  ...(await original()),
  useAtomValue: () => true,
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      { environmentId, label: "Laptop", connection: { phase: "connected" }, serverConfig: {} },
      {
        environmentId: remoteEnvironmentId,
        label: "Build host",
        connection: { phase: "connected" },
        serverConfig: {},
      },
    ],
  }),
  usePrimaryEnvironmentId: () => environmentId,
  usePullRequestsSupported: () => false,
  useEnvironmentProviders: () => new Map([[environmentId, [provider]]]),
}));
vi.mock(import("../../hooks/useSettings"), async (original) => ({
  ...(await original()),
  useEnvironmentSettings: (() => ({
    ...DEFAULT_CLIENT_SETTINGS,
    ...DEFAULT_SERVER_SETTINGS,
  })) as never,
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    {
      environmentId,
      id: projectId,
      title: "Workspaces",
      workspaceRoot: "/workspace/project",
      projectIcon: { kind: "emoji", emoji: "📁" },
    },
    {
      environmentId: remoteEnvironmentId,
      id: remoteProjectId,
      title: "Mobile app",
      workspaceRoot: "/workspace/mobile",
      projectIcon: { kind: "emoji", emoji: "📱" },
    },
  ],
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({
    data: fixture.data,
    error: null,
    isPending: false,
    refresh: fixture.refresh,
  }),
}));
vi.mock("../../state/taskWorkspace", () => ({
  taskWorkspaceRead: () => null,
  taskWorkspaceCommand: { permissionAtom: () => "task-workspace-permission" },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => fixture.command,
}));
vi.mock(import("../sidebar/SidebarUpdatePill"), () => ({
  SidebarUpdatePill: () => <span aria-hidden />,
}));
vi.mock("../ChatMarkdown", () => ({
  default: ({ text }: { text: string }) => <p>{text}</p>,
}));

it("moves a task to another column and opens the same task from its chat link", async () => {
  setup();
  await using screen = await render(<TaskTracker target={scope} />);
  const source = screen.getByRole("region", { name: "To do", exact: true });
  const destination = screen.getByRole("region", { name: "In review", exact: true });
  const card = source.getByRole("button", { name: /Review mobile navigation/ });
  await expect.element(card).toBeVisible();

  const dataTransfer = new DataTransfer();
  await act(() => {
    card.element().dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    destination.element().dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });

  const moved = destination.getByRole("button", { name: /Review mobile navigation/ });
  await expect.element(moved).toBeVisible();
  await expect.element(card).not.toBeInTheDocument();
  await userEvent.click(moved);
  expect(fixture.navigate).toHaveBeenCalledWith({
    to: "/tasks",
    search: { ...scope, view: "board", localTaskId: "task-1" },
  });

  await screen.rerender(<TaskTracker target={{ ...scope, threadId }} />);
  const dialog = page.getByRole("dialog", { name: "Review mobile navigation" });
  await expect
    .element(dialog.getByRole("link", { name: "Open chat" }))
    .toHaveAttribute("href", "/laptop/thread");
  await expect
    .element(dialog.getByRole("combobox", { name: "Task status" }))
    .toHaveTextContent("In review");
  const activity = dialog.getByRole("list", { name: "Task activity" }).getByRole("listitem");
  await expect
    .element(activity.nth(0).getByText("Navigation is ready for review.", { exact: true }))
    .toBeVisible();
  await expect.element(activity.nth(1).getByText("Created task", { exact: true })).toBeVisible();
});

it("switches projects from the header and keeps the current view", async () => {
  setup();
  await using screen = await render(<TaskTracker target={{ ...scope, view: "archive" }} />);
  await userEvent.click(screen.getByRole("combobox", { name: "Project: Workspaces" }));
  const search = page.getByPlaceholder("Search projects");
  await userEvent.fill(search, "Build host");
  await expect.element(page.getByRole("option", { name: /Workspaces/ })).not.toBeInTheDocument();
  await userEvent.click(page.getByRole("option", { name: /Mobile app/ }));
  expect(fixture.navigate).toHaveBeenCalledWith({
    to: "/tasks",
    search: { environmentId: remoteEnvironmentId, projectId: remoteProjectId, view: "archive" },
  });
});

it("sends the board idea with the selected agent and exposes the real chat link", async () => {
  setup();
  await using screen = await render(<TaskTracker target={scope} />);
  const send = screen.getByRole("button", { name: "Send idea" });
  await expect.element(send).toBeDisabled();
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Project idea" }),
    "Make the navigation keyboard friendly.",
  );
  await userEvent.click(send);
  expect(fixture.command).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: {
      ...scope,
      workspaceRoot: "/workspace/project",
      revision: 1,
      command: {
        _tag: "submitLocalTaskIdeas",
        submissionId: expect.any(String),
        prompt: "Make the navigation keyboard friendly.",
        modelSelection,
      },
    },
  });
  await expect
    .element(screen.getByRole("link", { name: "Ideas chat" }))
    .toHaveAttribute("href", "/laptop/ideas-thread");
});

it("only sends pending feedback when asked and records that it was sent", async () => {
  const task = board.tasks[0]!;
  const comments = ["Spacing", "Focus ring"].map((body, index) => ({
    id: `feedback-${index}`,
    author: "Designer",
    body,
    source: "user" as const,
    createdAt: timestamp,
    feedback: { status: "pending" as const },
  }));
  setup({
    ...snapshot,
    board: {
      ...board,
      tasks: [
        {
          ...task,
          comments,
          initialBrief: "Review the navigation structure.",
          links: [
            {
              id: "design-1",
              title: "Mobile mockup",
              kind: "design",
              target: "design-document",
              author: "Designer",
              createdAt: timestamp,
            },
          ],
          threadHistory: [
            {
              id: "branch-1",
              kind: "branch",
              description: "Switched to navigation-review",
              createdAt: timestamp,
              previousBranch: "main",
              branch: "navigation-review",
            },
          ],
        },
      ],
    },
  });
  await using screen = await render(<TaskTracker target={scope} />);
  await expect
    .element(screen.getByRole("button", { name: `Send feedback for ${task.title}` }))
    .toBeVisible();
  await screen.rerender(<TaskTracker target={{ ...scope, localTaskId: task.id }} />);
  const dialog = page.getByRole("dialog", { name: task.title });
  const send = dialog.getByRole("button", { name: "Send feedback (2)", exact: true });
  await expect
    .element(dialog.getByRole("link", { name: "Mobile mockup" }))
    .toHaveAttribute("href", "/design?documentId=design-document");
  await expect
    .element(
      dialog
        .getByRole("list", { name: "Task work history" })
        .getByText("Switched to navigation-review"),
    )
    .toBeVisible();
  await expect.element(send).toBeVisible();
  expect(fixture.command).not.toHaveBeenCalled();
  await userEvent.click(send);
  expect(fixture.command).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: {
      ...scope,
      workspaceRoot: "/workspace/project",
      revision: 1,
      command: {
        _tag: "sendLocalTaskFeedback",
        taskId: task.id,
        commentIds: comments.map(({ id }) => id),
      },
    },
  });
  await expect.element(dialog.getByText("Sent", { exact: true }).first()).toBeVisible();
  expect(dialog.getByText("Sent", { exact: true }).all()).toHaveLength(2);
});
