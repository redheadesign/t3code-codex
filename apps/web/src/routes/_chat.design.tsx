import type { EnvironmentId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { DesignWorkspace } from "../components/design/DesignWorkspace";

export interface DesignRouteSearch {
  readonly documentId?: string;
  readonly pageId?: string;
  readonly nodeId?: string;
  readonly commentId?: string;
  readonly environmentId?: EnvironmentId;
  readonly cwd?: string;
  readonly relativePath?: string;
}

function DesignRoute() {
  const search = Route.useSearch();
  const hasSyncTarget =
    search.environmentId !== undefined &&
    search.cwd !== undefined &&
    search.relativePath !== undefined;
  return (
    <DesignWorkspace
      key={search.documentId ?? "design-default"}
      shellIntegrated
      {...(search.documentId === undefined ? {} : { documentId: search.documentId })}
      {...(search.pageId === undefined ? {} : { pageId: search.pageId })}
      {...(search.nodeId === undefined ? {} : { nodeId: search.nodeId })}
      {...(search.commentId === undefined ? {} : { commentId: search.commentId })}
      syncTarget={
        hasSyncTarget
          ? {
              environmentId: search.environmentId,
              cwd: search.cwd,
              relativePath: search.relativePath,
            }
          : null
      }
    />
  );
}

export const Route = createFileRoute("/_chat/design")({
  validateSearch: (raw: Record<string, unknown>): DesignRouteSearch => ({
    ...(typeof raw.documentId === "string" && raw.documentId ? { documentId: raw.documentId } : {}),
    ...(typeof raw.pageId === "string" && raw.pageId ? { pageId: raw.pageId } : {}),
    ...(typeof raw.nodeId === "string" && raw.nodeId ? { nodeId: raw.nodeId } : {}),
    ...(typeof raw.commentId === "string" && raw.commentId ? { commentId: raw.commentId } : {}),
    ...(typeof raw.environmentId === "string" && raw.environmentId
      ? { environmentId: raw.environmentId as EnvironmentId }
      : {}),
    ...(typeof raw.cwd === "string" && raw.cwd ? { cwd: raw.cwd } : {}),
    ...(typeof raw.relativePath === "string" && raw.relativePath
      ? { relativePath: raw.relativePath }
      : {}),
  }),
  component: DesignRoute,
});
