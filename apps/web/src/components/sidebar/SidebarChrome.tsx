import {
  ArrowLeftIcon,
  CalendarClockIcon,
  HomeIcon,
  ListTodoIcon,
  SettingsIcon,
} from "lucide-react";
import { memo } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";

import { useUiText } from "~/i18n";
import { SidebarBrandMark } from "./SidebarBrandMark";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { isSettingsPage, isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning } from "./SidebarUpdatePill";
import { observeResize } from "~/lib/observeResize";
import { usePullRequestsSupported } from "../../state/environments";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { UsageIndicatorButton } from "./UsageIndicator";
import { validateScheduledTasksSearch } from "../settings/scheduledTasksSettings.logic";

export { SidebarActivityButton, SidebarActivityPanel } from "./SidebarActivity";

export function SidebarBrandWidthProbe({
  isElectron,
  onWidthChange,
}: {
  isElectron: boolean;
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = (probe: HTMLDivElement) => {
    return observeResize(probe, ([entry]) => {
      if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
    });
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-[var(--workspace-titlebar-content-left)] flex gap-1">
        <SidebarBrandMark />
        {isElectron ? <div className="w-[calc(2*var(--workspace-titlebar-control-size))]" /> : null}
      </div>
    </div>
  );
}

const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const text = useUiText();
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebar();
  const isOnUtilityPage = useLocation({
    select: (location) => isSidebarUtilityPage(location.pathname),
  });
  const isOnSettingsPage = useLocation({
    select: (location) => isSettingsPage(location.pathname),
  });
  const settingsReturn = useLocation({
    select: (location) => {
      if (!isSettingsPage(location.pathname) || typeof location.search !== "object") return null;
      const search = validateScheduledTasksSearch(location.search as Record<string, unknown>);
      if (search.returnTo !== "automations") return null;
      return {
        ...(search.returnEnvironmentId ? { environmentId: search.returnEnvironmentId } : {}),
        ...(search.returnTaskId ? { taskId: search.returnTaskId } : {}),
      };
    },
  });
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const handleBackClick = () => {
    closeMobileSidebar();
    if (settingsReturn !== null) {
      void navigate({ to: "/automations", search: settingsReturn });
    } else {
      void navigateToMainApp();
    }
  };

  return (
    <SidebarMenu className="flex-row items-center">
      {isOnUtilityPage || isOnSettingsPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>{text("Back", "Назад")}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : null}
      <SidebarThreadUndoNotice />
    </SidebarMenu>
  );
});

const SidebarMobileNavigation = memo(function SidebarMobileNavigation() {
  const text = useUiText();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { setOpenMobile } = useSidebar();
  const pullRequestsSupported = usePullRequestsSupported();
  const close = () => setOpenMobile(false);
  const itemClass = "min-w-0 flex-1";
  const linkClass = "justify-center px-0";
  return (
    <SidebarMenu className="flex-row items-center md:hidden">
      <SidebarMenuItem className={itemClass}>
        <SidebarMenuButton
          size="icon"
          className={linkClass}
          isActive={pathname === "/"}
          tooltip={text("Home", "Главная")}
          render={<Link to="/" aria-label={text("Home", "Главная")} onClick={close} />}
        >
          <HomeIcon />
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem className={itemClass}>
        <SidebarMenuButton
          size="icon"
          className={linkClass}
          isActive={pathname === "/automations"}
          tooltip={text("Automations", "Автоматизации")}
          render={
            <Link
              to="/automations"
              aria-label={text("Automations", "Автоматизации")}
              onClick={close}
            />
          }
        >
          <CalendarClockIcon />
        </SidebarMenuButton>
      </SidebarMenuItem>
      {pullRequestsSupported ? (
        <SidebarMenuItem className={itemClass}>
          <SidebarMenuButton
            size="icon"
            className={linkClass}
            isActive={pathname === "/pull-requests"}
            tooltip={text("Pull requests", "Пул-реквесты")}
            render={
              <Link
                to="/pull-requests"
                search={readPullRequestListPreferences()}
                aria-label={text("Pull requests", "Пул-реквесты")}
                onClick={close}
              />
            }
          >
            <PullRequestGlyph.pullRequest />
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : null}
      <SidebarMenuItem className={itemClass}>
        <SidebarMenuButton
          size="icon"
          className={linkClass}
          isActive={pathname === "/tasks"}
          tooltip={text("Tasks", "Задачи")}
          render={<Link to="/tasks" aria-label={text("Tasks", "Задачи")} onClick={close} />}
        >
          <ListTodoIcon />
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem className={itemClass}>
        <UsageIndicatorButton
          onClick={() => {
            close();
            void navigate({ to: "/usage" });
          }}
          active={pathname === "/usage"}
        />
      </SidebarMenuItem>
      <SidebarMenuItem className={itemClass}>
        <SidebarMenuButton
          size="icon"
          className={linkClass}
          isActive={pathname.startsWith("/settings")}
          tooltip={text("Settings", "Настройки")}
          render={
            <Link to="/settings" aria-label={text("Settings", "Настройки")} onClick={close} />
          }
        >
          <SettingsIcon />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarMobileNavigation />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
