// @effect-diagnostics-next-line nodeBuiltinImport:off - The Effect spawner can stall on Windows registry queries.
import * as NodeChildProcess from "node:child_process";

import * as Effect from "effect/Effect";

const INTERNET_SETTINGS = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const LOOPBACK_BYPASS = ["localhost", "127.0.0.1", "::1", "[::1]"];

function resolveStaticProxy(settings: string) {
  if (!/^\s*ProxyEnable[ \t]+REG_DWORD[ \t]+0x1\s*$/im.test(settings)) return undefined;
  if (/^\s*AutoConfigURL[ \t]+REG_SZ[ \t]+\S/im.test(settings)) return undefined;

  const address = settings.match(/^\s*ProxyServer[ \t]+REG_SZ[ \t]+(\S+)\s*$/im)?.[1];
  if (!address || !/^(?:http:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\]):\d{1,5}$/i.test(address)) {
    return undefined;
  }

  const proxy = URL.parse(address.includes("://") ? address : `http://${address}`);
  return proxy?.port === "0" ? undefined : proxy?.origin;
}

export const resolveEnv = Effect.fn("DesktopWindowsProxy.resolveEnv")(function* (
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): Effect.fn.Return<Record<string, string>> {
  if (platform !== "win32") return {};

  const envKeys = new Map(Object.keys(env).map((key) => [key.toUpperCase(), key]));
  const hasExplicitProxy = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"].some((key) =>
    envKeys.has(key),
  );
  const nodeProxyKey = envKeys.get("NODE_USE_ENV_PROXY") ?? "NODE_USE_ENV_PROXY";
  const nodeProxy = env[nodeProxyKey];
  if (hasExplicitProxy || (nodeProxy !== undefined && nodeProxy !== "1")) return {};

  const root = env.SystemRoot ?? env.WINDIR;
  const settings = yield* Effect.callback<string>((resume, signal) => {
    NodeChildProcess.execFile(
      root ? `${root}\\System32\\reg.exe` : "reg.exe",
      ["query", INTERNET_SETTINGS],
      { encoding: "utf8", windowsHide: true, timeout: 5_000, signal },
      (error, stdout) => resume(Effect.succeed(error ? "" : stdout)),
    );
  });
  const proxy = resolveStaticProxy(settings);
  if (!proxy) return {};

  const noProxyKey = envKeys.get("NO_PROXY") ?? "NO_PROXY";
  const noProxy = env[noProxyKey]?.trim();
  const bypass = new Set([
    ...(noProxy
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? []),
    ...LOOPBACK_BYPASS,
  ]);

  return {
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    [noProxyKey]: noProxy === "*" ? noProxy : [...bypass].join(","),
    [nodeProxyKey]: "1",
  };
});
