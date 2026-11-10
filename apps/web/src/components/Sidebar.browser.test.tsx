import type { EnvironmentServerConfig } from "@t3tools/client-runtime/connection";
import { DEFAULT_CLIENT_SETTINGS, EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import type { ReactNode } from "react";

import { render } from "../../test/render";
import { openCommandPalette } from "../commandPaletteBus";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { __setClientSettingsForTests, getClientSettings } from "../hooks/useSettings";
import { useProjects, useQuietThreadShells, useServerConfigs } from "../state/entities";
import { makeThreadFixture } from "../test-fixtures";
import type { Project } from "../types";
import Sidebar from "./Sidebar";
import { SidebarProvider } from "./ui/sidebar";

vi.mock("../state/entities", { spy: true });
vi.mock("../hooks/useHandleNewThread", { spy: true });
vi.mock("../commandPaletteBus", () => ({
  openCommandPalette: vi.fn(),
  isCommandPaletteOpen: () => false,
}));
vi.mock("./sidebar/SidebarChrome", () => ({
  SidebarChromeHeader: ({ actions }: { actions?: ReactNode }) => <>{actions}</>,
  SidebarActivityButton: () => null,
  SidebarChromeFooter: () => null,
}));

function project(id: string): Project {
  return {
    id: ProjectId.make(id),
    environmentId: EnvironmentId.make("local"),
    title: id,
    workspaceRoot: `/projects/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scripts: [],
  };
}

describe("sidebar header new thread", () => {
  it.each([
    { mode: "normal", count: 2, shift: false, picker: false },
    { mode: "boring", count: 2, shift: false, picker: false },
    { mode: "boring", count: 2, shift: true, picker: true },
    { mode: "boring", count: 1, shift: false, picker: false },
    { mode: "legacy", count: 2, shift: false, picker: false },
  ] as const)("$mode sidebar, $count projects, shift=$shift: picker=$picker", async (scenario) => {
    using stack = new DisposableStack();
    const previousSettings = getClientSettings();
    stack.defer(() => __setClientSettingsForTests(previousSettings));
    __setClientSettingsForTests({
      ...DEFAULT_CLIENT_SETTINGS,
      boringSidebarEnabled: scenario.mode === "boring",
      legacySidebarEnabled: scenario.mode === "legacy",
    });
    const projects = [project("active"), project("idle")].slice(0, scenario.count);
    const currentProjectRef = {
      environmentId: projects[0]!.environmentId,
      projectId: projects[0]!.id,
    };
    const startThread = vi.fn().mockResolvedValue(null);
    vi.mocked(useProjects).mockReturnValue(projects);
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: currentProjectRef,
      handleNewThread: startThread,
      routeDraftId: null,
      routeThreadRef: null,
    });
    vi.mocked(openCommandPalette).mockClear();
    await using screen = await render(
      <SidebarProvider>
        <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </SidebarProvider>,
    );

    expect(screen.container.querySelector('[aria-label="Filter threads by project"]')).toBeNull();
    if (scenario.mode === "boring") {
      await expect.element(screen.getByText("Projects", { exact: true })).toBeVisible();
      expect(
        screen.container.querySelectorAll('[data-testid="sidebar-project-folder"]'),
      ).toHaveLength(scenario.count);
      expect(screen.getByText("No chats", { exact: true }).all()).toHaveLength(scenario.count);
    }

    await userEvent.click(screen.getByRole("button", { name: "New thread", exact: true }), {
      modifiers: scenario.shift ? ["Shift"] : [],
    });

    if (scenario.picker) {
      expect(openCommandPalette).toHaveBeenCalledExactlyOnceWith({ open: "new-thread-in" });
      expect(startThread).not.toHaveBeenCalled();
    } else {
      expect(openCommandPalette).not.toHaveBeenCalled();
      expect(startThread).toHaveBeenCalledExactlyOnceWith(currentProjectRef);
    }
  });
});

it("keeps completed chats in their folders and unmatched chats below Projects", async () => {
  using stack = new DisposableStack();
  const previousSettings = getClientSettings();
  stack.defer(() => __setClientSettingsForTests(previousSettings));
  __setClientSettingsForTests({ ...DEFAULT_CLIENT_SETTINGS, boringSidebarEnabled: true });
  const ownedProject = project("Workshop");
  const scratchProject = { ...project("Scratch"), isScratch: true as const };
  vi.mocked(useProjects).mockReturnValue([ownedProject, scratchProject]);
  vi.mocked(useServerConfigs).mockReturnValue(
    new Map([
      [
        ownedProject.environmentId,
        { environment: { capabilities: {} } } as EnvironmentServerConfig,
      ],
    ]),
  );
  const settledAt = "2026-01-01T00:00:00.000Z";
  vi.mocked(useQuietThreadShells).mockReturnValue([
    makeThreadFixture({
      environmentId: ownedProject.environmentId,
      projectId: ownedProject.id,
      id: ThreadId.make("completed-chat"),
      title: "Review completed",
      settledOverride: "settled",
      settledAt,
    }),
    makeThreadFixture({
      environmentId: scratchProject.environmentId,
      projectId: scratchProject.id,
      id: ThreadId.make("scratch-chat"),
      title: "Quick sketch",
      settledOverride: "settled",
      settledAt,
    }),
  ]);
  stack.defer(() => {
    vi.mocked(useQuietThreadShells).mockReset();
    vi.mocked(useServerConfigs).mockReset();
  });

  await using screen = await render(
    <SidebarProvider>
      <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
    </SidebarProvider>,
  );
  const projectChat = screen.getByRole("button", { name: /Review completed/ });
  await expect.element(projectChat).toBeVisible();
  await expect.element(projectChat).toHaveAttribute("data-testid", "sidebar-row-folder");
  const projects = screen.getByText("Projects", { exact: true });
  const recent = screen.getByText("Recent", { exact: true });
  await expect.element(recent).toBeVisible();
  const recentChat = screen.getByRole("button", { name: /Quick sketch/ });
  await expect.element(recentChat).toBeVisible();
  await expect.element(recentChat).toHaveAttribute("data-testid", "sidebar-row-slim");
  expect(
    projects.element().compareDocumentPosition(recent.element()) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await expect.element(screen.getByText("Settled", { exact: true })).not.toBeInTheDocument();
});
