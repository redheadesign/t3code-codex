import { createFileRoute } from "@tanstack/react-router";

import { TaskTracker, type TasksSearch } from "../components/tasks/TaskTracker";
import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export const Route = createFileRoute("/_chat/tasks")({
  validateSearch: (raw: Record<string, unknown>): TasksSearch => {
    const environmentId = parseOptionalString(raw.environmentId);
    const projectId = parseOptionalString(raw.projectId);
    const taskId = parseOptionalString(raw.taskId);
    const localTaskId = parseOptionalString(raw.localTaskId);
    const wikiPageId = parseOptionalString(raw.wikiPageId);
    const threadId = parseOptionalString(raw.threadId);
    const view = raw.view;
    return {
      ...(environmentId === undefined ? {} : { environmentId: environmentId as EnvironmentId }),
      ...(projectId === undefined ? {} : { projectId: projectId as ProjectId }),
      ...(taskId === undefined ? {} : { taskId }),
      ...(localTaskId === undefined ? {} : { localTaskId }),
      ...(wikiPageId === undefined ? {} : { wikiPageId }),
      ...(threadId === undefined ? {} : { threadId: threadId as ThreadId }),
      ...(view === "board" || view === "archive" || view === "wiki" || view === "jira"
        ? { view }
        : {}),
    };
  },
  component: () => <TaskTracker target={Route.useSearch()} />,
});
