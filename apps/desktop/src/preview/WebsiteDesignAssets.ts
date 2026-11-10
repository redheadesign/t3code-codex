import type { DesktopPreviewDesignCapture } from "@t3tools/contracts";

const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_CAPTURE_ASSET_BYTES = 16 * 1024 * 1024;
const MAX_ASSETS = 64;

async function readImage(response: Response, maxBytes: number) {
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
  if (
    !response.ok ||
    !response.body ||
    !/^image\/[a-z0-9.+-]{1,64}$/i.test(mimeType) ||
    Number(response.headers.get("content-length")) > maxBytes
  ) {
    await response.body?.cancel();
    return null;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) return null;
    chunks.push(chunk);
  }
  return size > 0 ? { mimeType, bytes: Buffer.concat(chunks, size) } : null;
}

export async function captureWebsiteDesignAssets(
  nodes: ReadonlyArray<
    Pick<DesktopPreviewDesignCapture["nodes"][number], "kind" | "assetUrl" | "assetLoaded">
  >,
  session: Pick<Electron.Session, "fetch">,
  signal: AbortSignal,
): Promise<NonNullable<DesktopPreviewDesignCapture["inlineAssets"]>> {
  const urls = new Set<string>();
  for (const node of nodes) {
    const url = node.assetUrl;
    if (node.kind !== "image" || !node.assetLoaded || !url || url.length > 8192 || urls.has(url)) {
      continue;
    }
    const parsed = URL.parse(url);
    if (!parsed || !/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
      continue;
    }
    urls.add(url);
    if (urls.size === MAX_ASSETS) break;
  }
  const assets: Array<{ url: string; mimeType: string; base64: string }> = [];
  let budget = MAX_CAPTURE_ASSET_BYTES;
  for (const url of urls) {
    if (signal.aborted || budget === 0) break;
    try {
      const response = await session.fetch(url, { credentials: "omit", redirect: "error", signal });
      const image = await readImage(response, Math.min(budget, MAX_ASSET_BYTES));
      if (!image) continue;
      budget -= image.bytes.byteLength;
      assets.push({ url, mimeType: image.mimeType, base64: image.bytes.toString("base64") });
    } catch {
      // A blocked asset stays linked to the original URL.
    }
  }
  return assets;
}
