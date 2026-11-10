import { Link, useRouter } from "@tanstack/react-router";
import {
  CodeIcon,
  FilePlus2Icon,
  FolderIcon,
  LayersIcon,
  LinkIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { cn } from "../../lib/utils";
import { ensureLocalApi } from "../../localApi";
import { ProjectFavicon, type ProjectFaviconProject } from "../ProjectFavicon";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Textarea } from "../ui/textarea";
import { DesignSceneNode } from "./DesignScene";
import {
  designFileProjectKey,
  DesignFileProjectPicker,
  useDesignFileProjects,
} from "./DesignFileProjectPicker";
import { designAgentReference } from "./designAgentReference";
import { DESIGN_DESCRIPTION_LIMIT, type DesignDocument } from "./designDocument";
import {
  designProjectConnection,
  type DesignProjectConnection,
  type DesignFileLocation,
  type StoredDesignDocument,
} from "./designDocumentStore";

const previewNodeLimit = 180;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const designFileDragType = "application/x-t3-design-file";

type DesignProjectTarget = Pick<DesignProjectConnection, "environmentId" | "cwd">;
type GalleryGroup = {
  title: string;
  project?: ProjectFaviconProject;
  connection?: DesignProjectTarget;
  folders: Map<string, StoredDesignDocument[]>;
};

export function NewDesignDocumentDialog({
  project,
  working,
  onCreate,
  onClose,
}: {
  readonly project: DesignProjectTarget | null;
  readonly working: boolean;
  readonly onCreate: (project: DesignProjectTarget | undefined, description: string) => void;
  readonly onClose: () => void;
}) {
  const projects = useDesignFileProjects();
  const [projectKey, setProjectKey] = useState(() =>
    project ? designFileProjectKey(project) : "local",
  );
  const [description, setDescription] = useState("");
  const connection =
    projects.get(projectKey)?.connection ??
    (project && projectKey === designFileProjectKey(project) ? project : undefined);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !working) onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>New design document</DialogTitle>
          <DialogDescription>
            Choose a project or keep the file in Local files. Use Sync in the editor to share the
            file with agents.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (projectKey === "local" || connection) onCreate(connection, description);
            }}
          >
            <DesignFileProjectPicker
              projects={projects}
              value={projectKey}
              onChange={setProjectKey}
            />
            <Textarea
              aria-label="Description"
              placeholder="Description (optional)"
              value={description}
              maxLength={DESIGN_DESCRIPTION_LIMIT}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                type="button"
                variant="secondary"
                disabled={working}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                type="submit"
                disabled={working || (projectKey !== "local" && !connection)}
              >
                Create document
              </Button>
            </div>
          </form>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

function DesignThumbnail({ document }: { readonly document: DesignDocument }) {
  const preview = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Offscreen cards do not need scene nodes or local image reads.
  useEffect(() => {
    if (!preview.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting === true),
      {
        rootMargin: "160px",
      },
    );
    observer.observe(preview.current);
    return () => observer.disconnect();
  }, []);

  const scene = (() => {
    if (!visible) return null;
    const page = document.pages[0];
    if (!page) return null;
    const byId = new Map(document.nodes.map((node) => [node.nodeId, node]));
    const roots = page.nodeIds.flatMap((id) => {
      const node = byId.get(id);
      return node && node.visible !== false ? [node] : [];
    });
    const frame =
      roots.find((node) => node.nodeId === page.prototypeStartNodeId) ??
      roots.find((node) => node.kind === "frame") ??
      roots[0];
    if (!frame) return null;
    const nodeMap = new Map<string, (typeof roots)[number]>();
    const remaining = [frame];
    for (let index = 0; index < remaining.length && nodeMap.size < previewNodeLimit; index++) {
      const node = remaining[index]!;
      if (nodeMap.has(node.nodeId) || node.visible === false) continue;
      // Gallery previews use local assets and never request remote images on card mount.
      const { sourceUrl, ...localNode } = node;
      nodeMap.set(
        node.nodeId,
        sourceUrl?.startsWith("data:") ? { ...localNode, sourceUrl } : localNode,
      );
      for (const id of node.childIds) {
        const child = byId.get(id);
        if (child) remaining.push(child);
        if (remaining.length >= previewNodeLimit) break;
      }
    }
    return { frame: nodeMap.get(frame.nodeId)!, nodeMap };
  })();

  return (
    <div
      ref={preview}
      className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40"
      aria-hidden="true"
    >
      {scene ? (
        <svg
          className="pointer-events-none absolute inset-0 size-full p-3"
          viewBox={`0 0 ${Math.max(scene.frame.width, 1)} ${Math.max(scene.frame.height, 1)}`}
        >
          <foreignObject width="100%" height="100%">
            <div
              inert
              className="relative size-full overflow-hidden"
              style={{ background: document.pages[0]?.background }}
            >
              <DesignSceneNode
                document={document}
                node={{ ...scene.frame, x: 0, y: 0 }}
                nodeMap={scene.nodeMap}
                selected={[]}
              />
            </div>
          </foreignObject>
        </svg>
      ) : (
        <LayersIcon className="size-6 text-muted-foreground" />
      )}
    </div>
  );
}

function DesignFileCard({
  record,
  group,
  working,
  onCopy,
  onMove,
  onDragging,
}: {
  readonly record: StoredDesignDocument;
  readonly group: GalleryGroup;
  readonly working: boolean;
  readonly onCopy: () => void;
  readonly onMove: () => void;
  readonly onDragging: (id: string | null) => void;
}) {
  const { document } = record;
  const date = new Date(document.updatedAt);
  const project = record.location?.project;
  const needsSync = document.syncState !== "synced" || document.pendingOperations.length > 0;
  const { copyToClipboard: copyReference } = useCopyToClipboard({ target: "Design reference" });
  const copyAgentReference = () => {
    if (!project) return;
    copyReference(
      designAgentReference({
        relativePath: project.relativePath,
        documentId: document.documentId,
        needsSync,
      }),
    );
  };
  return (
    <li
      className="relative min-w-0"
      onContextMenu={(event) => {
        event.preventDefault();
        void ensureLocalApi()
          .contextMenu.show(
            [
              { id: "copy", label: "Copy file link" },
              ...(project ? [{ id: "reference", label: "Copy reference for agent" }] : []),
              { id: "move", label: "Move to folder…" },
            ],
            { x: event.clientX, y: event.clientY },
          )
          .then((action) => {
            if (action === "copy") onCopy();
            if (action === "reference") copyAgentReference();
            if (action === "move") onMove();
          });
      }}
    >
      <Link
        to="/design"
        search={{ documentId: document.documentId }}
        draggable={!working}
        onDragStart={(event) => {
          event.dataTransfer.setData(designFileDragType, document.documentId);
          event.dataTransfer.effectAllowed = "move";
          onDragging(document.documentId);
        }}
        onDragEnd={() => onDragging(null)}
        className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring hover:[&>div]:border-foreground/40"
      >
        <DesignThumbnail document={document} />
        <div className="mt-2 min-w-0 pe-9">
          <p className="wrap-break-word text-sm font-medium">{document.title}</p>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {project ? (
              <span className="flex min-w-0 items-center gap-1.5">
                {group.project ? (
                  <ProjectFavicon project={group.project} className="size-3" />
                ) : (
                  <FolderIcon className="size-3 shrink-0" aria-hidden="true" />
                )}
                <span className="wrap-anywhere">{group.title}</span>
              </span>
            ) : null}
            {Number.isFinite(date.getTime()) ? (
              <time className="shrink-0" dateTime={document.updatedAt}>
                {dateFormat.format(date)}
              </time>
            ) : null}
            {project && needsSync ? <span>Needs sync</span> : null}
          </div>
          {document.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {document.description}
            </p>
          ) : null}
        </div>
      </Link>
      <div className="absolute end-0 bottom-0">
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost-muted"
                size="icon-sm"
                aria-label={`Actions for ${document.title}`}
              />
            }
          >
            <MoreHorizontalIcon />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={onCopy}>
              <LinkIcon /> Copy file link
            </MenuItem>
            {project ? (
              <MenuItem onClick={copyAgentReference}>
                <CodeIcon /> Copy reference for agent
              </MenuItem>
            ) : null}
            <MenuItem onClick={onMove}>
              <FolderIcon /> Move to folder…
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </li>
  );
}

export function DesignGallery({
  records,
  unavailable,
  working,
  actions,
  onCreate,
  onOpen,
  onTrash,
  onMove,
}: {
  readonly records: readonly StoredDesignDocument[];
  readonly unavailable: boolean;
  readonly working: boolean;
  readonly actions?: ReactNode;
  readonly onCreate: () => void;
  readonly onOpen: () => void;
  readonly onTrash: () => void;
  readonly onMove: (id: string, location: DesignFileLocation) => void;
}) {
  const router = useRouter();
  const projects = useDesignFileProjects();
  const { copyToClipboard } = useCopyToClipboard({ target: "Design file link" });
  const [query, setQuery] = useState("");
  const [moving, setMoving] = useState<StoredDesignDocument | null>(null);
  const [moveProject, setMoveProject] = useState("local");
  const [folder, setFolder] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragRecord = records.find((record) => record.document.documentId === dragging);
  const groups = new Map<string, GalleryGroup>();
  const term = query.trim().toLocaleLowerCase();
  for (const record of records) {
    if (record.trashedAt !== null) continue;
    const project = record.location?.project;
    const folder = record.location?.folder ?? "";
    const key = project ? designFileProjectKey(project) : "local";
    const liveProject = projects.get(key)?.project;
    const title = project
      ? (liveProject?.title ?? project.cwd.split(/[\\/]/u).filter(Boolean).at(-1) ?? project.cwd)
      : "Local files";
    if (
      term &&
      !`${title} ${folder} ${record.document.title} ${record.document.description ?? ""}`
        .toLocaleLowerCase()
        .includes(term)
    )
      continue;
    const group = groups.get(key) ?? {
      title,
      ...(project ? { connection: project } : {}),
      ...(liveProject ? { project: liveProject } : {}),
      folders: new Map(),
    };
    const files = group.folders.get(folder) ?? [];
    files.push(record);
    group.folders.set(folder, files);
    groups.set(key, group);
  }

  if (dragRecord && !dragRecord.location?.project) {
    for (const [key, { project, connection }] of projects) {
      if (!groups.has(key))
        groups.set(key, { title: project.title, project, connection, folders: new Map() });
    }
  }

  const move = (
    record: StoredDesignDocument,
    target: DesignProjectTarget | undefined,
    folder: string,
  ) => {
    const id = record.document.documentId;
    const project = record.location?.project ?? (target && designProjectConnection(target, id));
    onMove(id, { ...(project ? { project } : {}), ...(folder ? { folder } : {}) });
  };

  const dragFile = (id: string | null) => {
    setDragging(id);
    setDropTarget(null);
  };

  const dropProps = (key: string, group: GalleryGroup, folder: string) => {
    const sourceProject = dragRecord?.location?.project;
    const sourceKey = sourceProject ? designFileProjectKey(sourceProject) : "local";
    const target = JSON.stringify([key, folder]);
    const acceptsDrop =
      !working &&
      dragRecord &&
      dragRecord.trashedAt === null &&
      (!sourceProject || sourceKey === key) &&
      (sourceKey !== key || (dragRecord.location?.folder ?? "") !== folder);
    return {
      active: acceptsDrop && dropTarget === target,
      events: {
        onDragOver(event: DragEvent<HTMLElement>) {
          if (!event.dataTransfer.types.includes(designFileDragType)) return;
          event.stopPropagation();
          if (!acceptsDrop) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropTarget(target);
        },
        onDragLeave(event: DragEvent<HTMLElement>) {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          )
            return;
          setDropTarget((current) => (current === target ? null : current));
        },
        onDrop(event: DragEvent<HTMLElement>) {
          if (!event.dataTransfer.types.includes(designFileDragType)) return;
          event.stopPropagation();
          if (
            !acceptsDrop ||
            event.dataTransfer.getData(designFileDragType) !== dragRecord.document.documentId
          )
            return;
          event.preventDefault();
          dragFile(null);
          move(dragRecord, group.connection, folder);
        },
      },
    };
  };

  const moveFile = () => {
    if (!moving) return;
    const target = projects.get(moveProject)?.connection;
    if (!moving.location?.project && moveProject !== "local" && !target) return;
    const nextFolder = folder
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join(" / ");
    move(moving, target, nextFolder);
    setMoving(null);
  };
  return (
    <main className="min-h-0 flex-1 overflow-auto scrollbar-gutter-both">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Design files</h1>
            <p className="text-sm text-muted-foreground">
              Open a design or find it by project and folder.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost-muted" onClick={onTrash}>
              Recently deleted
            </Button>
            <Button size="sm" variant="secondary" onClick={onOpen}>
              Open file…
            </Button>
            {actions}
            <Button size="sm" disabled={working} onClick={onCreate}>
              <FilePlus2Icon /> New design document
            </Button>
          </div>
        </header>
        {unavailable ? (
          <p role="status" className="text-sm text-muted-foreground">
            This file is unavailable on this device. Open a local copy or check Recently deleted.
          </p>
        ) : null}
        <div className="max-w-xs">
          <Input
            aria-label="Search Design files"
            placeholder="Search files"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {groups.size === 0 ? (
          <p className="border-t border-border py-8 text-sm text-muted-foreground">
            {term
              ? "No files match your search."
              : "Create or open a design document to get started."}
          </p>
        ) : (
          [...groups].map(([key, group]) => {
            const rootDrop = dropProps(key, group, "");
            return (
              <section
                key={key}
                className={cn(
                  "space-y-4 rounded-sm border-t border-border pt-5",
                  rootDrop.active && "outline-2 -outline-offset-2 outline-primary",
                )}
                {...rootDrop.events}
              >
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  {group.project ? (
                    <ProjectFavicon project={group.project} className="size-4" />
                  ) : null}
                  {group.title}
                </h2>
                {[...group.folders].map(([folder, files]) => {
                  const folderDrop = folder ? dropProps(key, group, folder) : null;
                  return (
                    <div
                      key={folder}
                      className={cn(
                        "space-y-3 rounded-sm",
                        folderDrop?.active && "outline-2 -outline-offset-2 outline-primary",
                      )}
                      {...folderDrop?.events}
                    >
                      {folder ? (
                        <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <FolderIcon className="size-4" aria-hidden="true" />
                          {folder}
                        </h3>
                      ) : null}
                      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-x-5 gap-y-6">
                        {files.map((record) => (
                          <DesignFileCard
                            key={record.document.documentId}
                            record={record}
                            group={group}
                            working={working}
                            onDragging={dragFile}
                            onCopy={() => {
                              const location = router.buildLocation({
                                to: "/design",
                                search: { documentId: record.document.documentId },
                              });
                              copyToClipboard(
                                new URL(
                                  router.history.createHref(location.publicHref),
                                  window.location.href,
                                ).href,
                              );
                            }}
                            onMove={() => {
                              setMoving(record);
                              setMoveProject(
                                record.location?.project
                                  ? designFileProjectKey(record.location.project)
                                  : "local",
                              );
                              setFolder(record.location?.folder ?? "");
                            }}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </section>
            );
          })
        )}
      </div>
      <Dialog
        open={moving !== null}
        onOpenChange={(open) => {
          if (!open) setMoving(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Move to folder</DialogTitle>
            <DialogDescription>
              Use a slash for a nested folder. Leave the path empty to move the file to the project
              root.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                moveFile();
              }}
            >
              {!moving?.location?.project && projects.size > 0 ? (
                <DesignFileProjectPicker
                  projects={projects}
                  value={moveProject}
                  onChange={setMoveProject}
                />
              ) : null}
              <Input
                autoFocus
                aria-label="Folder path"
                placeholder="Screens / Checkout"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" type="button" variant="secondary" onClick={() => setMoving(null)}>
                  Cancel
                </Button>
                <Button size="sm" type="submit" disabled={working}>
                  Move file
                </Button>
              </div>
            </form>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </main>
  );
}
