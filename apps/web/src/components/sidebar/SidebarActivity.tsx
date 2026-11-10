import { Link } from "@tanstack/react-router";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  ArrowLeftIcon,
  BellIcon,
  CheckCheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CirclePlayIcon,
} from "lucide-react";
import { useId, useState, type RefCallback } from "react";

import { useUiText } from "~/i18n";
import { useProjects, useQuietThreadShells } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useUiStateStore } from "../../uiStateStore";
import {
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
  resolveThreadStatusPill,
} from "../Sidebar.logic";
import { SidebarContent, SidebarGroup, SidebarMenuButton, useSidebar } from "../ui/sidebar";
import { SidebarHeaderIconButton } from "./SidebarThreadHeader";

type Thread = ReturnType<typeof useQuietThreadShells>[number];
type ActivityKind = "attention" | "unread" | "running" | "completed";

const ACTIVITY_PAGE_SIZE = 10;
const activityKinds = {
  attention: { rank: 0, icon: CircleAlertIcon, tone: "text-warning-foreground" },
  unread: { rank: 1, icon: CircleCheckIcon, tone: "text-success-foreground" },
  running: { rank: 2, icon: CirclePlayIcon, tone: "text-info-foreground" },
  completed: { rank: 3, icon: CircleCheckIcon, tone: "text-muted-foreground" },
} as const;

const statusByPill = {
  "Pending Approval": { kind: "attention", label: ["Needs approval", "Ждёт подтверждения"] },
  "Awaiting Input": { kind: "attention", label: ["Needs input", "Ждёт ответа"] },
  "Guest Request": { kind: "attention", label: ["Guest request", "Запрос гостя"] },
  "Plan Ready": { kind: "attention", label: ["Plan ready", "План готов"] },
  Failed: { kind: "attention", label: ["Failed", "Ошибка"] },
  Completed: { kind: "unread", label: ["Completed · unread", "Готово · не прочитано"] },
  Working: { kind: "running", label: ["Running", "В работе"] },
  Connecting: { kind: "running", label: ["Starting", "Запускается"] },
  Waiting: { kind: "running", label: ["Waiting", "Ожидает"] },
} as const satisfies Record<string, { kind: ActivityKind; label: readonly [string, string] }>;

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});
const russianDateFormat = new Intl.DateTimeFormat("ru-RU", {
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
      ? ({ kind: "attention", label: ["Usage limit", "Достигнут лимит"] } as const)
      : pill !== null
        ? statusByPill[pill.label]
        : thread.latestRun?.status === "completed"
          ? ({ kind: "completed", label: ["Completed", "Готово"] } as const)
          : null;
  if (status === null) return null;
  const timestamp =
    status.kind === "completed" || status.kind === "unread"
      ? (thread.latestRun?.completedAt ?? thread.updatedAt)
      : thread.updatedAt;
  return { ...status, key, thread, timestamp, time: Date.parse(timestamp) };
}

export function SidebarActivityButton({
  onOpen,
  buttonRef,
}: {
  onOpen: () => void;
  buttonRef?: RefCallback<HTMLButtonElement>;
}) {
  const text = useUiText();
  const threads = useQuietThreadShells();
  const localVisits = useUiStateStore((state) => state.threadLastVisitedAtById);
  const indicatorId = useId();
  const hasNew = threads.some((thread) => {
    const entry = getActivity(thread, localVisits);
    return entry?.kind === "attention" || entry?.kind === "unread";
  });
  return (
    <SidebarHeaderIconButton
      ref={buttonRef}
      label={text("Notifications", "Уведомления")}
      onClick={onOpen}
      aria-describedby={hasNew ? indicatorId : undefined}
    >
      <BellIcon aria-hidden="true" />
      {hasNew ? (
        <>
          <span aria-hidden className="absolute end-1.5 top-1.5 size-1.5 rounded-full bg-info" />
          <span id={indicatorId} className="sr-only">
            {text("There is new activity", "Есть новые уведомления")}
          </span>
        </>
      ) : null}
    </SidebarHeaderIconButton>
  );
}

export function SidebarActivityPanel(props: { onBack: () => void }) {
  const text = useUiText();
  const formatter = text("en", "ru") === "ru" ? russianDateFormat : dateFormat;
  const threads = useQuietThreadShells();
  const projects = useProjects();
  const localVisits = useUiStateStore((state) => state.threadLastVisitedAtById);
  const markLocalVisit = useUiStateStore((state) => state.markThreadVisited);
  const visit = useAtomCommand(threadEnvironment.visit);
  const { isMobile, setOpenMobile } = useSidebar();
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const titleId = useId();
  const entries = threads
    .map((thread) => getActivity(thread, localVisits))
    .filter((entry) => entry !== null)
    .sort(
      (left, right) =>
        activityKinds[left.kind].rank - activityKinds[right.kind].rank || right.time - left.time,
    );
  const projectTitles = new Map(
    projects.map((project) => [`${project.environmentId}:${project.id}`, project.title]),
  );
  const unread = entries.filter((entry) => entry.kind === "unread");
  const markAllRead = () => {
    for (const { key, thread, timestamp } of unread) {
      if (thread.lastVisitedAt === undefined) {
        markLocalVisit(key, timestamp);
      } else {
        void visit({
          environmentId: thread.environmentId,
          input: { threadId: thread.id, visitedAt: timestamp },
        });
      }
    }
  };

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-h-0 flex-1 flex-col"
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        props.onBack();
      }}
    >
      <SidebarContent
        scrollFade={false}
        fixedHeader={
          <div className="flex items-center gap-1 border-b border-sidebar-border/70 px-2 py-2">
            <SidebarHeaderIconButton
              label={text("Back to projects", "К проектам")}
              onClick={props.onBack}
              ref={focusActivityBackButton}
            >
              <ArrowLeftIcon aria-hidden="true" />
            </SidebarHeaderIconButton>
            <h2 id={titleId} className="min-w-0 flex-1 text-sm font-medium">
              {text("Notifications", "Уведомления")}
            </h2>
            <SidebarHeaderIconButton
              label={text("Mark all as read", "Отметить всё прочитанным")}
              tooltip={text("Mark all as read", "Прочитать всё")}
              onClick={markAllRead}
              disabled={unread.length === 0}
            >
              <CheckCheckIcon aria-hidden="true" />
            </SidebarHeaderIconButton>
          </div>
        }
      >
        <SidebarGroup>
          {entries.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {text(
                "Updates appear here when a chat starts work, needs your input, or finishes.",
                "Здесь появятся чаты, которые начали работу, ждут ответа или завершились.",
              )}
            </p>
          ) : (
            <ul className="space-y-0.5" aria-label={text("Chat activity", "События в чатах")}>
              {entries
                .slice(0, visibleCount)
                .map(({ kind, key, label, thread, timestamp, time }) => {
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
                              if (isMobile) setOpenMobile(false);
                            }}
                          />
                        }
                      >
                        <Icon aria-hidden="true" className={tone} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{thread.title}</span>
                          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                            <span className="min-w-0 flex-1 truncate">
                              {text(label[0], label[1])}
                              {project ? ` · ${project}` : null}
                            </span>
                            {Number.isFinite(time) ? (
                              <time dateTime={timestamp} className="shrink-0">
                                {formatter.format(time)}
                              </time>
                            ) : null}
                          </span>
                        </span>
                      </SidebarMenuButton>
                    </li>
                  );
                })}
              {entries.length > visibleCount ? (
                <li>
                  <SidebarMenuButton
                    type="button"
                    onClick={() => setVisibleCount(visibleCount + ACTIVITY_PAGE_SIZE)}
                  >
                    {text("Show more", "Показать ещё")}
                  </SidebarMenuButton>
                </li>
              ) : null}
            </ul>
          )}
        </SidebarGroup>
      </SidebarContent>
    </section>
  );
}

function focusActivityBackButton(button: HTMLButtonElement | null) {
  button?.focus();
}
