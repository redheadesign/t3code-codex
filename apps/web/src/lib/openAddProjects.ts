import {
  canCreateProjectInEnvironment,
  findExistingAddProject,
} from "@t3tools/client-runtime/operations/projects";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import { runAtomCommand, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  type DesktopBridge,
  type EnvironmentId,
} from "@t3tools/contracts";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";

import { openCommandPalette } from "../commandPaletteBus";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { desktopLocalBackendId, readDesktopSecondaryBootstraps } from "../connection/desktopLocal";
import { ensureLocalApi } from "../localApi";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readProjects } from "../state/entities";
import { readEnvironment, readPrimaryEnvironmentId } from "../state/environments";
import { environmentPresentations } from "../state/presentation";
import { projectEnvironment } from "../state/projects";
import { readEnvironmentScope } from "../state/session";
import { parseWslUncPath, resolveWslProjectSelection } from "../wslPaths";
import { newProjectId } from "./utils";

type UiText = (english: string, russian: string) => string;

let addingFromExplorer = false;

function getExplorerFolderTargets(paths: readonly string[], nativeEnvironmentId: EnvironmentId) {
  const bootstraps = paths.some(parseWslUncPath) ? readDesktopSecondaryBootstraps() : [];
  const wslCandidates =
    bootstraps.length === 0
      ? []
      : [...appAtomRegistry.get(environmentPresentations.presentationsAtom)].flatMap(
          ([environmentId, { entry }]) => {
            const backendId = desktopLocalBackendId(entry.target);
            const bootstrap = bootstraps.find(({ id }) => id === backendId);
            return bootstrap
              ? [
                  {
                    environmentId,
                    backendId: bootstrap.id,
                    runningDistro: bootstrap.runningDistro ?? null,
                  },
                ]
              : [];
          },
        );
  return paths.map((path) => {
    if (!parseWslUncPath(path))
      return { path, workspaceRoot: path, environmentId: nativeEnvironmentId };
    const wsl = resolveWslProjectSelection(path, wslCandidates);
    return {
      path,
      workspaceRoot: wsl?.linuxPath ?? path,
      environmentId: wsl?.environmentId ?? null,
    };
  });
}

function projectMutationError(result: Parameters<typeof squashAtomCommandFailure>[0], ui: UiText) {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : ui("Try again.", "Попробуйте ещё раз.");
}

async function addExplorerProjects(
  paths: readonly string[],
  nativeEnvironmentId: EnvironmentId,
  ui: UiText,
) {
  const seen = new Set<string>();
  const trustedPaths = new Map<string, string>();
  const failures: string[] = [];
  let added = 0;

  for (const { path, workspaceRoot, environmentId } of getExplorerFolderTargets(
    paths,
    nativeEnvironmentId,
  )) {
    if (!environmentId) {
      failures.push(
        `${path}\n${ui("Connect the matching WSL environment and select the folder again.", "Подключите нужное окружение WSL и выберите папку снова.")}`,
      );
      continue;
    }
    const key = `${environmentId}:${normalizeProjectPathForComparison(workspaceRoot)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (
      !canCreateProjectInEnvironment(readEnvironment(environmentId)?.connection.phase) ||
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)
    ) {
      failures.push(
        `${path}\n${ui("This connection cannot add projects.", "Это подключение не позволяет добавлять проекты.")}`,
      );
      continue;
    }

    const findExisting = () =>
      findExistingAddProject({ projects: readProjects(), environmentId, path: workspaceRoot });
    const existing = findExisting();
    let resolvedPath: string;
    if (existing && existing.archivedAt == null) {
      resolvedPath = existing.workspaceRoot;
    } else {
      const options = { reportFailure: false, reportDefect: false };
      const result = existing
        ? await runAtomCommand(
            appAtomRegistry,
            projectEnvironment.update,
            {
              environmentId,
              input: { projectId: existing.id, archived: false },
            },
            options,
          )
        : await runAtomCommand(
            appAtomRegistry,
            projectEnvironment.create,
            {
              environmentId,
              input: {
                projectId: newProjectId(),
                title: inferProjectTitleFromPath(workspaceRoot),
                workspaceRoot,
                createWorkspaceRootIfMissing: false,
              },
            },
            options,
          );

      if (result._tag === "Success") {
        resolvedPath = result.value.workspaceRoot;
        added += 1;
      } else {
        const concurrentProject = findExisting();
        if (!concurrentProject || concurrentProject.archivedAt != null) {
          failures.push(`${path}\n${projectMutationError(result, ui)}`);
          continue;
        }
        resolvedPath = concurrentProject.workspaceRoot;
      }
    }
    seen.add(`${environmentId}:${normalizeProjectPathForComparison(resolvedPath)}`);
    if (environmentId === nativeEnvironmentId) {
      trustedPaths.set(normalizeProjectPathForComparison(resolvedPath), resolvedPath);
    }
  }

  if (failures.length > 0) {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: ui("Some projects couldn’t be added", "Не удалось добавить некоторые проекты"),
        description: failures.join("\n\n"),
      }),
    );
  }
  if (added > 0) {
    toastManager.add({ type: "success", title: ui("Projects added", "Проекты добавлены") });
  }
  return [...trustedPaths.values()];
}

async function trustExplorerProjects(bridge: DesktopBridge, paths: readonly string[], ui: UiText) {
  if (paths.length === 0 || !bridge.trustProjectFolders) return;

  const result = await bridge.trustProjectFolders({
    paths,
    locale: ui("en", "ru") === "ru" ? "ru" : "en",
  });
  if (!result.confirmed) {
    if (result.codex === "failed") {
      toastManager.add({
        type: "error",
        title: ui(
          "Couldn’t verify the folders for Codex trust",
          "Не удалось проверить папки для Codex",
        ),
        description: ui(
          "Select specific project folders on a local drive.",
          "Выберите отдельные папки проектов на локальном диске.",
        ),
      });
    }
    return;
  }
  const codexDescription = {
    trusted: ui("Folders trusted in Codex.", "Папки добавлены в доверенные в Codex."),
    unavailable: ui(
      "Open the folders in Codex and confirm trust.",
      "Откройте папки в Codex и подтвердите доверие.",
    ),
    failed: ui(
      "Couldn’t save trust in Codex. Confirm it when opening each folder.",
      "Не удалось сохранить доверие в Codex. Подтвердите его при открытии папок.",
    ),
    skipped: "",
  }[result.codex];
  const claudeDescription =
    result.claude === "confirmation-required"
      ? ui(
          "Run claude from each folder and confirm trust.",
          "Запустите claude в каждой папке и подтвердите доверие.",
        )
      : "";
  const description = [codexDescription, claudeDescription].filter(Boolean).join(" ");
  if (!description) return;
  toastManager.add(
    stackedThreadToast({
      type: result.codex === "failed" ? "error" : "info",
      title: ui("Folder trust", "Доверие к папкам"),
      description,
    }),
  );
}

export function tryAddProjectsFromExplorer(
  ui: UiText,
  options?: {
    readonly environmentId?: EnvironmentId;
    readonly initialPath?: string;
    readonly onOpen?: () => void;
  },
): Promise<void> | null {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  if (bridge?.getClientPlatform?.() !== "win32") return null;
  const environmentId = readPrimaryEnvironmentId();
  if (!environmentId || (options?.environmentId && options.environmentId !== environmentId))
    return null;
  const environment = readEnvironment(environmentId);
  if (
    environment?.serverConfig?.environment.platform.os !== "windows" ||
    !canCreateProjectInEnvironment(environment.connection.phase) ||
    !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)
  )
    return null;
  if (addingFromExplorer) return Promise.resolve();

  const initialPath =
    options?.initialPath ?? environment.serverConfig.settings.addProjectBaseDirectory?.trim();
  addingFromExplorer = true;
  return (async () => {
    let stage: "pick" | "add" | "trust" = "pick";
    try {
      options?.onOpen?.();
      const paths = await ensureLocalApi().dialogs.pickFolders(
        initialPath ? { initialPath } : undefined,
      );
      if (paths.length === 0) return;
      stage = "add";
      const addedPaths = await addExplorerProjects(paths, environmentId, ui);
      stage = "trust";
      await trustExplorerProjects(bridge, addedPaths, ui);
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title:
            stage === "trust"
              ? ui("Couldn’t update folder trust", "Не удалось обновить доверие к папкам")
              : stage === "add"
                ? ui("Couldn’t add projects", "Не удалось добавить проекты")
                : ui("Couldn’t open the folder picker", "Не удалось открыть Проводник"),
          ...(error instanceof Error ? { description: error.message } : {}),
        }),
      );
    } finally {
      addingFromExplorer = false;
    }
  })();
}

export function openAddProjects(ui: UiText): void {
  if (!tryAddProjectsFromExplorer(ui)) openCommandPalette({ open: "add-project" });
}
