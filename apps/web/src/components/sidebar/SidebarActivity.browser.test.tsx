import { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { useProjects, useQuietThreadShells } from "../../state/entities";
import { makeThreadFixture } from "../../test-fixtures";
import { useUiStateStore } from "../../uiStateStore";
import { SidebarProvider } from "../ui/sidebar";
import { SidebarActivityButton, SidebarActivityPanel } from "./SidebarActivity";

vi.mock("../../state/entities", { spy: true });

function ActivityFixture() {
  const [open, setOpen] = useState(false);
  return open ? (
    <SidebarActivityPanel onBack={() => setOpen(false)} />
  ) : (
    <>
      <SidebarActivityButton onOpen={() => setOpen(true)} />
      <p>Projects</p>
    </>
  );
}

it("opens the sidebar with the keyboard, prioritizes attention, and returns to projects", async () => {
  using stack = new DisposableStack();
  const environmentId = EnvironmentId.make("local");
  const approval = makeThreadFixture({
    environmentId,
    id: ThreadId.make("approval"),
    title: "Review permissions",
    hasPendingApprovals: true,
  });
  const completion = makeThreadFixture({
    environmentId,
    id: ThreadId.make("completed"),
    title: "Build finished",
    latestRun: {
      runId: RunId.make("last-run"),
      status: "completed",
      requestedAt: "2026-11-10T09:00:00.000Z",
      startedAt: "2026-11-10T09:01:00.000Z",
      completedAt: "2026-11-10T09:05:00.000Z",
      assistantMessageId: null,
    },
  });
  const archived = makeThreadFixture({
    environmentId,
    id: ThreadId.make("archived"),
    title: "Archived task",
    hasPendingApprovals: true,
    archivedAt: "2026-11-10T09:06:00.000Z",
  });
  const previousVisits = useUiStateStore.getState().threadLastVisitedAtById;
  stack.defer(() => useUiStateStore.setState({ threadLastVisitedAtById: previousVisits }));
  useUiStateStore.setState({
    threadLastVisitedAtById: {
      ...previousVisits,
      [scopedThreadKey(scopeThreadRef(environmentId, completion.id))]: "2026-11-10T09:00:00.000Z",
    },
  });
  vi.mocked(useProjects).mockReturnValue([]);
  vi.mocked(useQuietThreadShells).mockReturnValue([completion, approval, archived]);
  await using screen = await render(
    <SidebarProvider>
      <ActivityFixture />
    </SidebarProvider>,
  );

  const trigger = screen.getByRole("button", { name: "Notifications" });
  trigger.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect.element(screen.getByText("Projects")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Back to projects" })).toHaveFocus();
  const entries = page.getByRole("list", { name: "Chat activity" }).getByRole("link");
  await expect.element(entries.nth(0)).toHaveAttribute("href", "/local/approval");
  await expect.element(entries.nth(0).getByText("Needs approval")).toBeVisible();
  await expect.element(entries.nth(1)).toHaveAttribute("href", "/local/completed");
  await expect.element(entries.nth(1).getByText("Completed · unread")).toBeVisible();
  await expect.element(page.getByText("Archived task")).not.toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await expect.element(screen.getByText("Projects")).toBeVisible();
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
  await expect.element(entries.nth(1).getByText("Completed", { exact: true })).toBeVisible();
  await expect.element(entries.nth(0).getByText("Needs approval")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Back to projects" }));
  await expect.element(screen.getByText("Projects")).toBeVisible();
});
