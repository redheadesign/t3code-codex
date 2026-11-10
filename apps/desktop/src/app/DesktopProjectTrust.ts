// @effect-diagnostics nodeBuiltinImport:off -- The short-lived app-server must close its own Windows pipes before exiting.
import * as NodeChildProcess from "node:child_process";
import * as NodeEvents from "node:events";
import * as NodeReadline from "node:readline";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { isNetworkPath, normalizeProjectPathForComparison } from "@t3tools/shared/path";
import { resolveSpawnCommand, type ResolvedSpawnCommand } from "@t3tools/shared/shell";
import type { TrustProjectFoldersResult } from "@t3tools/contracts";
import type * as CodexSchema from "effect-codex-app-server/schema";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import packageJson from "../../package.json" with { type: "json" };

const hasInvisiblePathControls = (path: string) =>
  Array.from(path).some((character) => {
    const code = character.charCodeAt(0);
    return (
      code < 32 ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x61c ||
      (code >= 0x200e && code <= 0x200f) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      (character.length === 1 && code >= 0xd800 && code <= 0xdfff)
    );
  });

export const canonicalProjectFolders = Effect.fn("desktop.projectTrust.canonicalFolders")(
  function* (input: readonly string[]) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const platform = yield* HostProcess.Platform;
    const home = yield* fs.realPath(yield* HostProcess.HomeDirectory);
    const allowedPath = (candidate: string) =>
      path.isAbsolute(candidate) &&
      (platform !== "win32" || /^[A-Za-z]:[/\\]/.test(candidate)) &&
      !isNetworkPath(candidate) &&
      !hasInvisiblePathControls(candidate);

    const directories = new Map<string, string>();
    for (const selected of input) {
      if (!allowedPath(selected)) return null;
      const canonical = yield* fs.realPath(selected);
      if (!allowedPath(canonical) || path.parse(canonical).root === canonical) return null;
      const relativeHome = path.relative(canonical, home);
      if (
        relativeHome === "" ||
        (!path.isAbsolute(relativeHome) && relativeHome.split(path.sep)[0] !== "..")
      ) {
        return null;
      }
      if ((yield* fs.stat(canonical)).type !== "Directory") return null;
      directories.set(normalizeProjectPathForComparison(canonical), canonical);
    }
    return [...directories.values()];
  },
  Effect.orElseSucceed(() => null),
);

export function codexProjectTrustEdits(paths: readonly string[]) {
  return paths.map((path) => ({
    keyPath: `projects.${JSON.stringify(path)}.trust_level`,
    mergeStrategy: "replace" as const,
    value: "trusted",
  })) satisfies CodexSchema.V2ConfigBatchWriteParams["edits"];
}

const decodeResponse = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      id: Schema.optionalKey(Schema.Union([Schema.Number, Schema.String])),
      error: Schema.optionalKey(Schema.Unknown),
      result: Schema.optionalKey(Schema.Unknown),
    }),
  ),
);
const decodeConfig = Schema.decodeUnknownSync(
  Schema.Struct({
    layers: Schema.optionalKey(
      Schema.NullOr(
        Schema.Array(
          Schema.Struct({
            name: Schema.Struct({
              type: Schema.String,
              profile: Schema.optionalKey(Schema.NullOr(Schema.String)),
            }),
            version: Schema.String,
          }),
        ),
      ),
    ),
  }),
);
const decodeWrite = Schema.decodeUnknownSync(
  Schema.Struct({ status: Schema.Literals(["ok", "okOverridden"]) }),
);

async function writeCodexTrust(
  command: ResolvedSpawnCommand,
  cwd: string,
  paths: readonly string[],
  signal: AbortSignal,
): Promise<TrustProjectFoldersResult["codex"]> {
  const child = NodeChildProcess.spawn(command.command, command.args, {
    cwd,
    shell: command.shell,
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  const lines = NodeReadline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const responses = lines[Symbol.asyncIterator]();
  const stop = () => {
    lines.close();
    child.stdin.destroy();
    child.stdout.destroy();
    if (!child.killed) child.kill();
  };
  child.on("error", () => lines.close());
  child.stdin.on("error", () => lines.close());
  child.stdout.on("error", () => lines.close());
  signal.addEventListener("abort", stop, { once: true });

  let nextId = 1;
  const send = (message: { method: string; id?: number; params?: unknown }) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  };
  const request = async (method: string, params: unknown) => {
    const id = nextId++;
    send({ method, id, params });
    while (!signal.aborted) {
      const line = await responses.next();
      if (line.done) break;
      const response = decodeResponse(line.value);
      if (response.id !== id) continue;
      if (!("error" in response) && "result" in response) return response.result;
      break;
    }
    throw new Error(`Codex app-server request failed (${method})`);
  };

  try {
    const spawned = await NodeEvents.EventEmitter.once(child, "spawn", { signal }).catch(
      () => null,
    );
    if (!spawned) return "unavailable";
    await request("initialize", {
      clientInfo: { name: "t3code", title: "T3 Code", version: packageJson.version },
      capabilities: { experimentalApi: true },
    } satisfies CodexSchema.V1InitializeParams);
    send({ method: "initialized" });

    const config = decodeConfig(await request("config/read", { includeLayers: true }));
    const userLayer = config.layers?.find(
      (layer) => layer.name.type === "user" && layer.name.profile == null,
    );
    const result = decodeWrite(
      await request("config/batchWrite", {
        edits: codexProjectTrustEdits(paths),
        ...(userLayer ? { expectedVersion: userLayer.version } : {}),
      } satisfies CodexSchema.V2ConfigBatchWriteParams),
    );
    return result.status === "ok" ? "trusted" : "failed";
  } finally {
    signal.removeEventListener("abort", stop);
    stop();
  }
}

export const trustCodexProjectFolders = Effect.fn("desktop.projectTrust.codex")(function* (
  paths: readonly string[],
): Effect.fn.Return<TrustProjectFoldersResult["codex"]> {
  const cwd = yield* HostProcess.HomeDirectory;
  const command = yield* resolveSpawnCommand("codex", ["app-server"], { bypassNpmShim: true });
  return yield* Effect.tryPromise((signal) => writeCodexTrust(command, cwd, paths, signal)).pipe(
    Effect.timeout("15 seconds"),
    Effect.orElseSucceed(() => "failed" as const),
  );
});
