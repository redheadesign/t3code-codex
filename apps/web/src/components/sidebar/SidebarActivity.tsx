import { Link } from "@tanstack/react-router";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { BellIcon, CircleAlertIcon, CircleCheckIcon, CirclePlayIcon } from "lucide-react";
import { useId, useState } from "react";

import { useProjects, useQuietThreadShells } from "../../state/entities";
import { useUiStateStore } from "../../uiStateStore";
import {
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
  resolveThreadStatusPill,
} from "../Sidebar.logic";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { SidebarMenuButton, useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

type Thread = ReturnType<typeof useQuietThreadShells>[number];
type ActivityKind = "attention" | "unread" | "running" | "completed";

const ACTIVITY_LIMIT = 10;
const activityKinds = {
  attention: { rank: 0, icon: CircleAlertIcon, tone: "text-warning-foreground" },
  unread: { rank: 1, icon: CircleCheckIcon, tone: "text-success-foreground" },
  running: { rank: 2, icon: CirclePlayIcon, tone: "text-info-foreground" },
  completed: { rank: 3, icon: CircleCheckIcon, tone: "text-muted-foreground" },
} as const;

const statusByPill = {
  "Pending Approval": { kind: "attention", label: "Needs approval" },
  "Awaiting Input": { kind: "attention", label: "Needs input" },
  "Guest Request": { kind: "attention", label: "Guest request" },
  "Plan Ready": { kind: "attention", label: "Plan ready" },
  Failed: { kind: "attention", label: "Failed" },
  Completed: { kind: "unread", label: "Completed · unread" },
  Working: { kind: "running", label: "Running" },
  Connecting: { kind: "running", label: "Starting" },
  Waiting: { kind: "running", label: "Waiting" },
} as const satisfies Record<string, { kind: ActivityKind; label: string }>;

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

function getActivity(thread: Thread, localVisits: Readonly<Record<string, string>>) {
  if (thread.archivedAt !== null || thread.deletedAt !== null || thread.lineage.sideChat === true) {
    return null;
  }
  const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
  const lastVisitedAt = resolveThreadLastVisitedAt(thread.lastVisitedAt, localVisits[key]);
  const pill = resolveThreadStatusPill({ thread: { ...thread, lastVisitedAt } });
  const status =
    resolveSidebarThreadStatus(thread) === "limited"
      ? ({ kind: "attention", label: "Usage limit" } as const)
      : pill !== null
        ? statusByPill[pill.label]
        : thread.latestRun?.status === "completed"
          ? ({ kind: "completed", label: "Completed" } as const)
          : null;
  if (status === null) return null;
  const timestamp =
    status.kind === "completed" || status.kind === "unread"
      ? (thread.latestRun?.completedAt ?? thread.updatedAt)
      : thread.updatedAt;
  return { ...status, key, thread, timestamp, time: Date.parse(timestamp) };
}

export function SidebarActivityButton() {
  const [open, setOpen] = useState(false);
  const threads = useQuietThreadShells();
  const projects = useProjects();
  const localVisits = useUiStateStore((state) => state.threadLastVisitedAtById);
  const { isMobile, setOpenMobile } = useSidebar();
  const indicatorId = useId();
  const hasNew = threads.some((thread) => {
    const entry = getActivity(thread, localVisits);
    return entry?.kind === "attention" || entry?.kind === "unread";
  });
  const entries = open
    ? threads
        .map((thread) => getActivity(thread, localVisits))
        .filter((entry) => entry !== null)
        .sort(
          (left, right) =>
            activityKinds[left.kind].rank - activityKinds[right.kind].rank ||
            right.time - left.time,
        )
        .slice(0, ACTIVITY_LIMIT)
    : [];
  const projectTitles = new Map(
    open
      ? projects.map((project) => [`${project.environmentId}:${project.id}`, project.title])
      : [],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <PopoverTrigger
          render={
            <TooltipTrigger
              render={
                <SidebarMenuButton
                  type="button"
                  size="icon"
                  className="relative shrink-0 [-webkit-app-region:no-drag]"
                  aria-label="View activity"
                  aria-describedby={hasNew ? indicatorId : undefined}
                />
              }
            />
          }
        >
          <BellIcon aria-hidden="true" />
          {hasNew ? (
            <>
              <span
                aria-hidden="true"
                className="absolute end-1.5 top-1.5 size-1.5 rounded-full bg-info"
              />
              <span id={indicatorId} className="sr-only">
                There is new activity
              </span>
            </>
          ) : null}
        </PopoverTrigger>
        <TooltipPopup side="bottom">View activity</TooltipPopup>
      </Tooltip>
      <PopoverPopup side="bottom" align="end" width="md" padding="compact">
        <div className="px-2 py-2">
          <PopoverTitle>Activity</PopoverTitle>
        </div>
        {entries.length === 0 ? (
          <p className="px-2 pb-3 text-sm text-muted-foreground">
            Updates appear here when a chat starts work, needs your input, or finishes.
          </p>
        ) : (
          <ul className="max-h-80 space-y-0.5 overflow-y-auto" aria-label="Chat activity">
            {entries.map(({ kind, key, label, thread, timestamp, time }) => {
              const { icon: Icon, tone } = activityKinds[kind];
              const project = projectTitles.get(`${thread.environmentId}:${thread.projectId}`);
              return (
                <li key={key}>
                  <SidebarMenuButton
                    size="lg"
                    render={
                      <Link
                        to="/$environmentId/$threadId"
                        params={{ environmentId: thread.environmentId, threadId: thread.id }}
                        title={thread.title}
                        onClick={() => {
                          setOpen(false);
                          if (isMobile) setOpenMobile(false);
                        }}
                      />
                    }
                  >
                    <Icon aria-hidden="true" className={tone} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{thread.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {project ? `${project} · ` : null}
                        {label}
                      </span>
                    </span>
                    {Number.isFinite(time) ? (
                      <time dateTime={timestamp} className="shrink-0 text-xs text-muted-foreground">
                        {dateFormat.format(time)}
                      </time>
                    ) : null}
                  </SidebarMenuButton>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverPopup>
    </Popover>
  );
}
