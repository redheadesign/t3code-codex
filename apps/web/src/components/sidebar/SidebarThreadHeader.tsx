import { ArchiveIcon, FolderPlusIcon } from "lucide-react";
import { type ComponentProps, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { T3Wordmark } from "../T3Wordmark";
import { SidebarMenuButton } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function SidebarThreadHeader(props: {
  onArchive: () => void;
  onNewProject: () => void;
  importSessions: ReactNode;
  activity?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-sm font-medium text-sidebar-foreground">
        <T3Wordmark aria-label="T3" className="h-3.5 w-auto shrink-0" />
        <span>Code</span>
      </div>
      {props.activity}
      <SidebarHeaderIconButton label="Add project" onClick={props.onNewProject}>
        <FolderPlusIcon />
      </SidebarHeaderIconButton>
      {props.importSessions}
      <SidebarHeaderIconButton label="Archived threads" onClick={props.onArchive}>
        <ArchiveIcon />
      </SidebarHeaderIconButton>
    </div>
  );
}

export function SidebarHeaderIconButton({
  label,
  tooltip = label,
  tooltipSide = "bottom",
  className,
  children,
  ...rest
}: {
  label: string;
  tooltip?: ReactNode;
  tooltipSide?: "top" | "bottom" | "left" | "right";
  className?: string | undefined;
  children?: ReactNode;
} & Omit<
  ComponentProps<typeof SidebarMenuButton>,
  "children" | "className" | "tooltip" | "isActive" | "aria-label"
>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            aria-label={label}
            {...rest}
            className={cn("relative size-7 shrink-0 [-webkit-app-region:no-drag]", className)}
          />
        }
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        />
      </TooltipTrigger>
      <TooltipPopup side={tooltipSide}>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
