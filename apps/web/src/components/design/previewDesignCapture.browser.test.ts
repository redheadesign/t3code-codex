import { PreviewDesignCapture } from "@t3tools/contracts";
import { DESIGN_CAPTURE_SCRIPT } from "@t3tools/shared/preview";
import * as Schema from "effect/Schema";
import { expect, it } from "vite-plus/test";

const decodeCapture = Schema.decodeUnknownSync(PreviewDesignCapture);

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
