import { PreviewDesignCapture } from "@t3tools/contracts";
import { DESIGN_CAPTURE_SCRIPT, DESIGN_WEBSITE_CAPTURE_SCRIPT } from "@t3tools/shared/preview";
import * as Schema from "effect/Schema";
import { expect, it, vi } from "vite-plus/test";

const decodeCapture = Schema.decodeUnknownSync(PreviewDesignCapture);

it("captures observed models without guessing across multiple files", async () => {
  const iframe = document.createElement("iframe");
  const loaded = new Promise<Event>((resolve) =>
    iframe.addEventListener("load", resolve, { once: true }),
  );
  iframe.srcdoc = `<canvas data-engine="three.js r180" aria-label="Hero scene" width="320" height="180"></canvas>`;
  document.body.append(iframe);
  try {
    await loaded;
    const frame = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (!frame) throw new Error("The capture fixture did not create a browsing context.");
    const resources: PerformanceEntry[] = [];
    using _timing = vi.spyOn(frame.performance, "getEntriesByType").mockReturnValue(resources);
    const fetchModel = vi.spyOn(frame, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith(".gltf")) return new Response('{"asset":{"version":"2.0"}}');
      const json = '{"asset":{"version":"2.0"}}'.padEnd(28);
      const buffer = new Uint8Array(20 + json.length);
      const header = new DataView(buffer.buffer);
      header.setUint32(0, 0x46546c67, true);
      header.setUint32(4, 2, true);
      header.setUint32(8, buffer.byteLength, true);
      header.setUint32(12, json.length, true);
      header.setUint32(16, 0x4e4f534a, true);
      buffer.set(new TextEncoder().encode(json), 20);
      return new Response(buffer);
    });
    try {
      const capture = async () => decodeCapture(await frame.eval(DESIGN_WEBSITE_CAPTURE_SCRIPT));
      const procedural = await capture();
      expect(procedural).toMatchObject({
        has3DContent: true,
        modelAssets: [],
        modelHostNodeIds: [procedural.nodes[0]!.nodeId],
      });
      const model = "https://assets.example.com/ship.glb";
      resources.push({ name: model } as PerformanceEntry);
      const placed = await capture();
      expect(placed.modelAssets).toMatchObject([
        { name: "ship.glb", mimeType: "model/gltf-binary", hostNodeIds: [placed.nodes[0]!.nodeId] },
      ]);
      expect(fetchModel).toHaveBeenCalledWith(model, {
        credentials: "omit",
        redirect: "error",
        signal: expect.objectContaining({ aborted: false }),
      });

      resources.push({ name: "https://assets.example.com/satellite.gltf" } as PerformanceEntry);
      expect((await capture()).modelAssets).toMatchObject([
        { name: "ship.glb", hostNodeIds: [] },
        { name: "satellite.gltf", mimeType: "model/gltf+json", hostNodeIds: [] },
      ]);
      const viewer = frame.document.createElement("model-viewer");
      viewer.setAttribute("src", model);
      viewer.style.cssText = "display:block;width:300px;height:200px";
      frame.document.body.append(viewer);
      const direct = await capture();
      expect(direct.modelAssets?.[0]?.hostNodeIds).toEqual([
        direct.nodes.find(({ name }) => name === "model-viewer")?.nodeId,
      ]);
    } finally {
      fetchModel.mockRestore();
    }
  } finally {
    iframe.remove();
  }
});

it("captures portable browser animations with their easing and leaves other motion frozen", async () => {
  const iframe = document.createElement("iframe");
  const loaded = new Promise<Event>((resolve) =>
    iframe.addEventListener("load", resolve, { once: true }),
  );
  iframe.srcdoc = `
    <style>
      body { height: 1000px }
      @keyframes pulse { 50% { opacity: .5 } }
      @keyframes bounce {
        0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(.8,0,1,1) }
        50% { transform: none; animation-timing-function: cubic-bezier(0,0,.2,1) }
      }
      @keyframes scale { from { transform: scale(.5) } to { transform: scale(1) } }
      @keyframes spin { to { transform: rotate(360deg) } }
      @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0 } }
      @keyframes reveal { from { opacity: 0 } to { opacity: 1 } }
      .pulse { animation: pulse 2s cubic-bezier(.4,0,.6,1) infinite }
      .bounce { height: 40px; animation: bounce 1s infinite }
      .scale { animation: scale 1s infinite }
      .spin { width: 24px; height: 24px; animation: spin 1s linear infinite }
      .ping { width: 24px; height: 24px; animation: ping 1s cubic-bezier(0,0,.2,1) infinite }
      .scroll { animation: reveal linear; animation-timeline: scroll(root) }
    </style>
    <div class="pulse" aria-label="pulse"></div>
    <div class="bounce" aria-label="bounce"></div>
    <div class="scale" aria-label="nested-scale"><span>Child</span></div>
    <div class="spin" aria-label="spin"></div>
    <div class="spin" style="transform-origin: 0 0" aria-label="off-center-spin"></div>
    <span class="ping" style="display: block" aria-label="ping"></span>
    <div class="scroll" aria-label="scroll"></div>
    <div style="opacity: 0" aria-label="transparent"></div>
  `;
  document.body.append(iframe);
  try {
    await loaded;
    const frame = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (!frame) throw new Error("The capture fixture did not create a browsing context.");
    const capture = decodeCapture(frame.eval(DESIGN_CAPTURE_SCRIPT));
    const layers = new Map(capture.nodes.map((node) => [node.name, node]));
    expect(layers.get("pulse")?.motion).toMatchObject({
      durationMs: 2000,
      iterations: "infinite",
      keyframes: [
        { offset: 0, opacity: 1 },
        { offset: 0.5, opacity: 0.5, easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
        { offset: 1, opacity: 1 },
      ],
    });
    const bounce = layers.get("bounce")?.motion;
    expect(bounce?.durationMs).toBe(1000);
    expect(
      (bounce?.keyframes[1]?.translation?.[1] ?? NaN) -
        (bounce?.keyframes[0]?.translation?.[1] ?? NaN),
    ).toBeCloseTo(10);
    const spin = layers.get("spin")?.motion;
    expect(
      (spin?.keyframes[1]?.rotation ?? NaN) - (spin?.keyframes[0]?.rotation ?? NaN),
    ).toBeCloseTo(360);
    expect(layers.get("ping")?.motion?.keyframes).toMatchObject([
      { offset: 0, scale: 1, opacity: 1 },
      { offset: 0.75, scale: 2, opacity: 0 },
      { offset: 1, scale: 2, opacity: 0 },
    ]);
    expect(layers.get("off-center-spin")?.motion).toBeUndefined();
    expect(layers.get("nested-scale")?.motion).toBeUndefined();
    expect(layers.get("scroll")?.motion).toBeUndefined();
    expect(layers.get("transparent")?.opacity).toBe(0);
  } finally {
    iframe.remove();
  }
});
