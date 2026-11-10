import { CalendarClockIcon, HomeIcon, ListTodoIcon, PaletteIcon, SettingsIcon } from "lucide-react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";

import { useUiText } from "~/i18n";
import { usePullRequestsSupported } from "../../state/environments";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarUpdatePill } from "./SidebarUpdatePill";
import { UsageIndicatorButton } from "./UsageIndicator";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";

function RailTooltip({ label, trigger }: { label: string; trigger: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

function RailLink({
  label,
  to,
  active,
  children,
}: {
  label: string;
  to: "/" | "/automations" | "/design" | "/settings" | "/pull-requests" | "/tasks";
  active: boolean;
  children: ReactNode;
}) {
  return (
    <RailTooltip
      label={label}
      trigger={
        <Button
          render={<Link to={to} aria-label={label} />}
          size="icon"
          variant={active ? "secondary" : "ghost"}
          className="size-9 rounded-xl"
        >
          {children}
        </Button>
      }
    />
  );
}

export function WorkspaceIconRail() {
  const text = useUiText();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const pullRequestsSupported = usePullRequestsSupported();

  return (
    <aside
      aria-label={text("Workspace navigation", "Разделы рабочего пространства")}
      className="absolute bottom-0 start-0 top-[calc(var(--workspace-chrome-height)+1px)] z-0 hidden w-(--workspace-rail-width) px-0.5 pb-0.5 md:flex"
      data-app-icon-rail=""
    >
      <nav className="flex h-full w-full flex-col items-center px-1.5 py-2 text-sidebar-foreground">
        <div className="mb-2 flex w-full flex-col items-center">
          <RailLink label={text("Home", "Главная")} to="/" active={pathname === "/"}>
            <HomeIcon />
          </RailLink>
        </div>

        <RailLink
          label={text("Automations", "Автоматизации")}
          to="/automations"
          active={pathname === "/automations"}
        >
          <CalendarClockIcon />
        </RailLink>
        <RailLink label={text("Design", "Дизайн")} to="/design" active={pathname === "/design"}>
          <PaletteIcon />
        </RailLink>

        {pullRequestsSupported ? (
          <RailTooltip
            label={text("Pull requests", "Пул-реквесты")}
            trigger={
              <Button
                aria-label={text("Pull requests", "Пул-реквесты")}
                render={<Link to="/pull-requests" search={readPullRequestListPreferences()} />}
                className="size-9 rounded-xl"
                size="icon"
                variant={pathname === "/pull-requests" ? "secondary" : "ghost"}
              >
                <PullRequestGlyph.pullRequest />
              </Button>
            }
          />
        ) : null}

        <RailLink label={text("Tasks", "Задачи")} to="/tasks" active={pathname === "/tasks"}>
          <ListTodoIcon />
        </RailLink>

        <div className="mt-auto flex flex-col items-center gap-1">
          <SidebarUpdatePill rail />
          <UsageIndicatorButton
            active={pathname === "/usage"}
            onClick={() => void navigate({ to: "/usage" })}
            rail
          />
          <RailLink
            label={text("Settings", "Настройки")}
            to="/settings"
            active={pathname.startsWith("/settings")}
          >
            <SettingsIcon />
          </RailLink>
        </div>
      </nav>
    </aside>
  );
}
