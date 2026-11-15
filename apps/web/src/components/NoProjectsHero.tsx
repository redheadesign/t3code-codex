import { useUiText } from "~/i18n";
import { workspaceAreaProps } from "../lib/workspaceFocus";
import { MessageSquareDashedIcon, PlusIcon } from "lucide-react";

import { isElectron } from "../env";
import { useScratchProject } from "../hooks/useScratchProject";
import { useTheme } from "../hooks/useTheme";
import { openAddProjects } from "../lib/openAddProjects";
import { usePrimaryEnvironmentId } from "../state/environments";
import { HomeArtwork, useHomeArtwork } from "./ascii-scenes/HomeArtwork";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { WorkspacePageHeader } from "./WorkspacePageHeader";

export function NoProjectsHero() {
  const ui = useUiText();
  const contentArea = workspaceAreaProps("home", 1, "Home");
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const scratchTargetEnvironmentId = scratchEnvironmentId(primaryEnvironmentId);
  const { resolvedTheme } = useTheme();
  const homeArtwork = useHomeArtwork();

  return (
    <SidebarInset
      {...contentArea}
      role="main"
      className="h-dvh min-h-0 overflow-hidden overscroll-y-none"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        {/* The desktop window only moves where CSS opts in, so keep a titlebar strip. */}
        {isElectron ? <WorkspacePageHeader electron /> : null}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <HomeArtwork selection={homeArtwork.selection} appearance={resolvedTheme} />
          <Empty size="hero" className="relative z-10 flex-1">
            <div className="w-full max-w-lg px-8 py-12">
              <EmptyHeader className="max-w-none">
                <EmptyTitle>{ui("What should we work on?", "Над чем работаем?")}</EmptyTitle>
                <EmptyDescription>
                  {scratchTargetEnvironmentId === null
                    ? "Add a project to start your first thread."
                    : "Add a project, or start without one."}
                </EmptyDescription>
                <div className="mt-6 flex justify-center gap-2">
                  <Button size="sm" onClick={() => openAddProjects(ui)}>
                    <PlusIcon className="size-4" />
                    {ui("Add project", "Добавить проект")}
                  </Button>
                  {scratchTargetEnvironmentId === null ? null : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void startScratchThread(scratchTargetEnvironmentId)}
                    >
                      <MessageSquareDashedIcon className="size-4" />
                      Start without a project
                    </Button>
                  )}
                </div>
              </EmptyHeader>
            </div>
          </Empty>
        </div>
      </div>
    </SidebarInset>
  );
}
