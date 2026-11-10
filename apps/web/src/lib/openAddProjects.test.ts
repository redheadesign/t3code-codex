import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { tryAddProjectsFromExplorer } from "./openAddProjects";

const mocks = vi.hoisted(() => ({
  readProjects: vi.fn<() => readonly EnvironmentProject[]>(),
  pickFolders: vi.fn<() => Promise<readonly string[]>>(),
  create: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
}));

class MissingFolder extends Data.TaggedError("MissingFolder")<{ readonly message: string }> {}

vi.mock("../state/entities", () => ({ readProjects: mocks.readProjects }));
vi.mock("../state/environments", () => ({
  readPrimaryEnvironmentId: () => "windows-local",
  readEnvironment: () => ({
    connection: { phase: "connected" },
    serverConfig: { environment: { platform: { os: "windows" } }, settings: {} },
  }),
}));
vi.mock("../state/session", () => ({ readEnvironmentScope: () => true }));
vi.mock("../localApi", () => ({
  ensureLocalApi: () => ({ dialogs: { pickFolders: mocks.pickFolders } }),
}));
vi.mock("../rpc/atomRegistry", () => ({ appAtomRegistry: {} }));
vi.mock("../state/presentation", () => ({ environmentPresentations: {} }));
vi.mock("./utils", () => ({ newProjectId: () => "new-project" }));
vi.mock("../state/projects", () => ({
  projectEnvironment: {
    create: { label: "project.create", run: mocks.create },
    update: { label: "project.update", run: mocks.update },
  },
}));
vi.mock("../components/ui/toast", () => ({
  toastManager: { add: mocks.toast },
  stackedThreadToast: (toast: unknown) => toast,
}));

it("deduplicates selected folders and trusts only registered canonical paths after a partial failure", async () => {
  const existing = {
    id: ProjectId.make("existing"),
    environmentId: EnvironmentId.make("windows-local"),
    title: "Existing",
    workspaceRoot: "C:\\Projects\\Existing",
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies EnvironmentProject;
  const archived = {
    ...existing,
    id: ProjectId.make("archived"),
    workspaceRoot: "C:\\Projects\\Archived",
    archivedAt: existing.createdAt,
  } satisfies EnvironmentProject;
  mocks.readProjects.mockReturnValue([existing, archived]);
  mocks.update.mockResolvedValueOnce(AsyncResult.success({ ...archived, archivedAt: null }));
  mocks.create
    .mockResolvedValueOnce(
      AsyncResult.failure(Cause.fail(new MissingFolder({ message: "Folder was removed" }))),
    )
    .mockResolvedValueOnce(
      AsyncResult.success({ ...existing, workspaceRoot: "C:\\Projects\\New" }),
    );
  const trustProjectFolders = vi.fn().mockResolvedValue({ confirmed: false });
  mocks.pickFolders.mockResolvedValue([
    "c:/projects/existing",
    "C:\\Projects\\Archived",
    "C:\\Projects\\Missing",
    "c:/projects/new",
    "C:\\Projects\\New\\",
  ]);
  vi.stubGlobal("window", {
    desktopBridge: {
      getClientPlatform: () => "win32",
      trustProjectFolders,
    },
  });

  try {
    const adding = tryAddProjectsFromExplorer((english) => english);
    expect(adding).not.toBeNull();
    await adding;
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(trustProjectFolders).toHaveBeenCalledExactlyOnceWith({
      locale: "en",
      paths: [existing.workspaceRoot, archived.workspaceRoot, "C:\\Projects\\New"],
    });
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        description: expect.stringContaining("Folder was removed"),
      }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
