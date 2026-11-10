import {
  TrustProjectFoldersInputSchema,
  TrustProjectFoldersResultSchema,
  type TrustProjectFoldersResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  canonicalProjectFolders,
  trustCodexProjectFolders,
} from "../../app/DesktopProjectTrust.ts";
import * as ElectronDialog from "../../electron/ElectronDialog.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as DesktopAppSettings from "../../settings/DesktopAppSettings.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

const copy = {
  en: {
    title: "Trust these folders in Codex?",
    description: "Codex can load project settings and run hooks from trusted folders.",
    accept: "Trust folders",
    cancel: "Cancel",
  },
  ru: {
    title: "Доверять этим папкам в Codex?",
    description: "В доверенных папках Codex может загружать настройки проекта и запускать хуки.",
    accept: "Доверять папкам",
    cancel: "Отмена",
  },
};

const skipped: TrustProjectFoldersResult = {
  confirmed: false,
  codex: "skipped",
  claude: "skipped",
};

export const trustProjectFolders = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.TRUST_PROJECT_FOLDERS_CHANNEL,
  payload: TrustProjectFoldersInputSchema,
  result: TrustProjectFoldersResultSchema,
  handler: Effect.fn("desktop.ipc.projectTrust.trustFolders")(function* (input, event) {
    const appSettings = yield* DesktopAppSettings.DesktopAppSettings;
    const settings = yield* appSettings.get;
    if (!settings.localEnvironmentEnabled || (settings.wslBackendEnabled && settings.wslOnly)) {
      return skipped;
    }

    const electronWindow = yield* ElectronWindow.ElectronWindow;
    const owner = Option.getOrNull(yield* electronWindow.focusedMainOrFirst);
    if (!owner || event?.sender.id !== owner.webContents.id || input.paths.length === 0) {
      return skipped;
    }

    const paths = yield* canonicalProjectFolders(input.paths);
    if (!paths) return { ...skipped, codex: "failed" as const };

    const dialog = yield* ElectronDialog.ElectronDialog;
    const strings = copy[input.locale ?? "en"];
    const result = yield* dialog.showMessageBox(
      {
        type: "warning",
        message: strings.title,
        detail: `${paths.join("\n")}\n\n${strings.description}`,
        buttons: [strings.accept, strings.cancel],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      },
      owner,
    );
    if (result.response !== 0) return skipped;

    const currentPaths = yield* canonicalProjectFolders(paths);
    if (
      !currentPaths ||
      currentPaths.length !== paths.length ||
      currentPaths.some((path, index) => path !== paths[index])
    ) {
      return { ...skipped, confirmed: true, codex: "failed" as const };
    }
    return {
      confirmed: true,
      codex: yield* trustCodexProjectFolders(paths),
      claude: "confirmation-required" as const,
    };
  }),
});
