import { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { useProjects, useQuietThreadShells } from "../../state/entities";
import { makeThreadFixture } from "../../test-fixtures";
import { SidebarProvider } from "../ui/sidebar";
import { SidebarActivityButton } from "./SidebarActivity";

vi.mock("../../state/entities", { spy: true });

it("opens with the keyboard and prioritizes chats that need attention", async () => {
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
    lastVisitedAt: "2026-11-10T09:00:00.000Z",
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
  vi.mocked(useProjects).mockReturnValue([]);
  vi.mocked(useQuietThreadShells).mockReturnValue([completion, approval, archived]);
  await using screen = await render(
    <SidebarProvider>
      <SidebarActivityButton />
    </SidebarProvider>,
  );

  const trigger = screen.getByRole("button", { name: "View activity" });
  trigger.element().focus();
  await userEvent.keyboard("{Enter}");
  const entries = page.getByRole("list", { name: "Chat activity" }).getByRole("link");
  await expect.element(entries.nth(0)).toHaveAttribute("href", "/local/approval");
  await expect.element(entries.nth(0).getByText("Needs approval")).toBeVisible();
  await expect.element(entries.nth(1)).toHaveAttribute("href", "/local/completed");
  await expect.element(entries.nth(1).getByText("Completed · unread")).toBeVisible();
  await expect.element(page.getByText("Archived task")).not.toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
});
