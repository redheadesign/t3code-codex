import * as NodePath from "@effect/platform-node/NodePath";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Electron from "electron";
import { vi } from "vite-plus/test";

vi.mock("electron", () => ({}));
vi.mock("node:child_process", () => ({
  spawn: () => {
    throw new Error("Trust must not write before confirmation");
  },
}));

import { codexProjectTrustEdits } from "../../app/DesktopProjectTrust.ts";
import * as ElectronDialog from "../../electron/ElectronDialog.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as DesktopAppSettings from "../../settings/DesktopAppSettings.ts";
import { trustProjectFolders } from "./projectTrust.ts";

const canonical = String.raw`C:\Projects\Site.v2`;
const home = String.raw`C:\Users\alice`;
const alias = String.raw`C:\Site`;
const fixture = (showMessageBox: ElectronDialog.ElectronDialog["Service"]["showMessageBox"]) =>
  Layer.mergeAll(
    Layer.succeed(HostProcess.HomeDirectory, home),
    Layer.succeed(HostProcess.Platform, "win32"),
    NodePath.layerWin32,
    FileSystem.layerNoop({
      realPath: (path) => {
        if (path === home || path === canonical) return Effect.succeed(path);
        if (path === alias) return Effect.succeed(canonical);
        return Effect.die(`Unexpected path lookup ${path}`);
      },
      stat: () => Effect.succeed({ type: "Directory" } as FileSystem.File.Info),
    }),
    DesktopAppSettings.layerTest(),
    Layer.mock(ElectronWindow.ElectronWindow)({
      focusedMainOrFirst: Effect.succeedSome({ webContents: { id: 7 } } as Electron.BrowserWindow),
    }),
    Layer.mock(ElectronDialog.ElectronDialog)({ showMessageBox }),
  );

it.effect("requires the main window and confirms canonical paths before writing trust", () =>
  Effect.gen(function* () {
    const request = { paths: [alias, canonical], locale: "ru" };
    const rejected = { confirmed: false, codex: "skipped", claude: "skipped" };
    const confirm = vi.fn<ElectronDialog.ElectronDialog["Service"]["showMessageBox"]>(() =>
      Effect.succeed({ response: 1, checkboxChecked: false }),
    );
    yield* Effect.gen(function* () {
      assert.deepEqual(
        yield* trustProjectFolders.handler(request, { sender: { id: 8 } }),
        rejected,
      );
      assert.lengthOf(confirm.mock.calls, 0);
      assert.deepEqual(
        yield* trustProjectFolders.handler(request, { sender: { id: 7 } }),
        rejected,
      );
      assert.lengthOf(confirm.mock.calls, 1);
      assert.deepEqual(confirm.mock.calls[0]?.[0].detail?.split("\n").slice(0, 2), [canonical, ""]);
      assert.strictEqual(confirm.mock.calls[0]?.[0].defaultId, 1);
    }).pipe(Effect.provide(fixture(confirm)));
  }),
);

it.effect("rejects network locations and the user home before the trust prompt", () =>
  Effect.gen(function* () {
    for (const path of [String.raw`\\host\share`, home]) {
      assert.deepEqual(
        yield* trustProjectFolders.handler({ paths: [path] }, { sender: { id: 7 } }),
        {
          confirmed: false,
          codex: "failed",
          claude: "skipped",
        },
      );
    }
  }).pipe(
    Effect.provide(fixture(() => Effect.die("An invalid path must not open a trust prompt"))),
  ),
);

it("quotes a project path as one Codex config key and preserves other keys", () => {
  assert.deepEqual(codexProjectTrustEdits([canonical]), [
    {
      keyPath: String.raw`projects."C:\\Projects\\Site.v2".trust_level`,
      mergeStrategy: "replace",
      value: "trusted",
    },
  ]);
});
