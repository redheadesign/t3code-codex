import { expect, it, vi } from "vite-plus/test";

import { readCapturedDesignImage } from "./designImage";

it("keeps captured and inline binary images without requiring renderer network access", async () => {
  using network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Fetch blocked"));
  const url = "https://cdn.example.com/logo.png";
  const png = { mimeType: "image/png", base64: "iVBORw==" };

  const captured = await readCapturedDesignImage(url, png, true);
  const inline = await readCapturedDesignImage("data:image/png,%89PNG", undefined, true);
  expect(captured?.type).toBe("image/png");
  expect(inline?.type).toBe("image/png");
  expect(await captured?.bytes()).toEqual(new Uint8Array([137, 80, 78, 71]));
  expect(await inline?.bytes()).toEqual(await captured?.bytes());
  expect(await readCapturedDesignImage(url, undefined, true)).toBeNull();
  expect(network).not.toHaveBeenCalled();
  await expect(readCapturedDesignImage(url, undefined, false)).rejects.toThrow("Fetch blocked");
});
