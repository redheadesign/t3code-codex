import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type TaskWorkspaceBoard,
  type TaskWorkspaceCommandInput,
  type TaskWorkspaceSnapshot,
} from "@t3tools/contracts";
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
const timestamp = "2026-11-10T08:00:00.000Z";
const scope = { environmentId, projectId };
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

const fixture = vi.hoisted(() => ({ navigate: vi.fn(), command: vi.fn(), refresh: vi.fn() }));

function setup() {
  fixture.navigate.mockReset();
  fixture.refresh.mockReset();
  fixture.command
    .mockReset()
    .mockImplementation(async ({ input }: { input: TaskWorkspaceCommandInput }) => {
      const { command } = input;
      const tasks = board.tasks.map((task) =>
        command._tag === "updateLocalTask" &&
        command.status !== undefined &&
        task.id === command.taskId
          ? { ...task, status: command.status }
          : task,
      );
      return AsyncResult.success({ ...snapshot, board: { ...board, revision: 2, tasks } });
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
    data: snapshot,
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
