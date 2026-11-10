export function designAgentReference({
  relativePath,
  documentId,
  pageId,
  nodeId,
  commentId,
  needsSync,
}: {
  readonly relativePath: string;
  readonly documentId: string;
  readonly pageId?: string;
  readonly nodeId?: string;
  readonly commentId?: string;
  readonly needsSync: boolean;
}) {
  return [
    `Design file ${relativePath}`,
    `Document ${documentId}`,
    ...(pageId ? [`Page ${pageId}`] : []),
    ...(nodeId ? [`Layer ${nodeId}`] : []),
    ...(commentId ? [`Comment ${commentId}`] : []),
    ...(needsSync
      ? ["The latest changes are local. Sync the design before reading this file."]
      : []),
  ].join("\n");
}
