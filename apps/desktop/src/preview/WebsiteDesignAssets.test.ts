import { expect, it } from "vite-plus/test";

import { captureWebsiteDesignAssets } from "./WebsiteDesignAssets.ts";

it("keeps usable image bytes when other site assets fail and downloads duplicates only once", async () => {
  const requests: string[] = [];
  const signal = new AbortController().signal;
  const images = [
    "https://example.com/broken.png",
    "https://cdn.example.com/huge.png",
    "https://cdn.example.com/logo.png",
    "https://cdn.example.com/logo.png",
    "https://cdn.example.com/never-loaded.png",
    "https://user:password@example.com/private.png",
    "data:image/png,%89PNG",
  ];
  const logo = new Uint8Array([137, 80, 78, 71]);
  const assets = await captureWebsiteDesignAssets(
    images.map((assetUrl) => ({
      kind: "image",
      assetUrl,
      assetLoaded: !assetUrl.endsWith("never-loaded.png"),
    })),
    {
      async fetch(input, init) {
        expect(init).toEqual({ credentials: "omit", redirect: "error", signal });
        const url = String(input);
        requests.push(url);
        if (url.endsWith("broken.png")) throw new TypeError("Network failure");
        const headers = { "content-type": "image/png" };
        if (url.endsWith("huge.png")) {
          return new Response(logo, {
            headers: { ...headers, "content-length": String(8 * 1024 * 1024 + 1) },
          });
        }
        return new Response(logo, { headers });
      },
    },
    signal,
  );

  expect(requests).toEqual(images.slice(0, 3));
  expect(assets).toEqual([
    { url: images[2], mimeType: "image/png", base64: Buffer.from(logo).toString("base64") },
  ]);
});
