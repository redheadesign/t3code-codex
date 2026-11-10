import { afterEach, assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

import { resolveEnv } from "./DesktopWindowsProxy.ts";

const execFile = vi.hoisted(() =>
  vi.fn<
    (
      executable: string,
      args: readonly string[],
      options: { readonly timeout: number; readonly windowsHide: boolean },
      callback: (error: Error | null, output: string) => void,
    ) => void
  >(),
);

vi.mock("node:child_process", () => ({ execFile }));

afterEach(() => {
  execFile.mockReset();
});

const proxySettings = (enabled: string, server: string) =>
  `\r\n    ProxyEnable    REG_DWORD    ${enabled}\r\n    ProxyServer    REG_SZ    ${server}\r\n`;

const registryOutput = (output: string) =>
  execFile.mockImplementationOnce((_exe, _args, _options, callback) => callback(null, output));

it.effect("enables the local system proxy at Node startup with a loopback bypass", () =>
  Effect.gen(function* () {
    registryOutput(proxySettings("0x1", "127.0.0.1:15678"));
    const env = yield* resolveEnv("win32", { no_proxy: "example.com,localhost" });
    assert.deepEqual(env, {
      HTTP_PROXY: "http://127.0.0.1:15678",
      HTTPS_PROXY: "http://127.0.0.1:15678",
      no_proxy: "example.com,localhost,127.0.0.1,::1,[::1]",
      NODE_USE_ENV_PROXY: "1",
    });
  }),
);

it.effect("preserves an explicit bypass for every host", () =>
  Effect.gen(function* () {
    registryOutput(proxySettings("0x1", "[::1]:15678"));
    const env = yield* resolveEnv("win32", { NO_PROXY: "*" });
    assert.equal(env.NO_PROXY, "*");
  }),
);

it.effect("skips discovery outside Windows or with explicit proxy settings", () =>
  Effect.gen(function* () {
    assert.deepEqual(yield* resolveEnv("darwin", {}), {});
    assert.deepEqual(yield* resolveEnv("win32", { https_proxy: "http://localhost:8080" }), {});
    assert.deepEqual(yield* resolveEnv("win32", { NODE_USE_ENV_PROXY: "0" }), {});
    assert.equal(execFile.mock.calls.length, 0);
  }),
);

it.effect.each([
  ["disabled", proxySettings("0x0", "127.0.0.1:15678")],
  ["non-loopback", proxySettings("0x1", "proxy.example.com:8080")],
  ["malformed", proxySettings("0x1", "127.0.0.1:65536")],
  ["absent", ""],
  [
    "PAC-managed",
    proxySettings("0x1", "127.0.0.1:15678") +
      "    AutoConfigURL    REG_SZ    http://example.com/proxy.pac\r\n",
  ],
])("ignores %s Windows proxy settings", ([, output]) =>
  Effect.gen(function* () {
    registryOutput(output);
    assert.deepEqual(yield* resolveEnv("win32", {}), {});
  }),
);

it.effect("continues startup if the registry cannot be read", () =>
  Effect.gen(function* () {
    execFile.mockImplementationOnce((_exe, _args, _options, callback) =>
      callback(new Error("access denied"), ""),
    );
    assert.deepEqual(yield* resolveEnv("win32", {}), {});
  }),
);
