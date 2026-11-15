import { useEffect, useRef } from "react";
import { getDocumentActivity, subscribeDocumentActivity } from "~/lib/documentActivity";
import { paintAnimalScene } from "./animalCanvas";
import type { AnimalSceneId } from "./animalScenes";
import { createAnimalSteering, type AnimalSteering } from "./animalSteering";
import { useCanvasMotion } from "./useCanvasMotion";

const foregroundControls =
  "[data-chat-composer-stack], [data-thread-details-card], button, a, input, select, textarea, label, summary, [contenteditable], [role=button], [role=dialog], [role=menu], [role=listbox]";

export default function AnimalSceneCanvas({
  sceneId,
  appearance,
  cellScale = 1,
}: {
  readonly sceneId: AnimalSceneId;
  readonly appearance: "dark" | "light";
  readonly cellScale?: number;
}) {
  const steeringRef = useRef<AnimalSteering | undefined>(undefined);
  const canvasRef = useCanvasMotion(
    (context, frame) =>
      paintAnimalScene(
        context,
        { ...frame, sceneId, cellScale },
        frame.time > 0 ? steeringRef.current : undefined,
      ),
    appearance,
    30,
    cellScale,
  );

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- observe pointer input on the canvas's host without intercepting foreground controls
  useEffect(() => {
    const canvas = canvasRef.current;
    const area = canvas?.closest("[data-ascii-home-artwork]")?.parentElement;
    if (!canvas || !area) return;

    const steering = createAnimalSteering();
    steeringRef.current = steering;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const leave = () => {
      steering.pointer = undefined;
    };
    const clear = () => {
      leave();
      steering.click = undefined;
    };
    const isActive = () => {
      const { focused, visible } = getDocumentActivity();
      return focused && visible && !motion.matches;
    };
    const point = (event: MouseEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      if (x >= 0 && y >= 0 && x < bounds.width && y < bounds.height) {
        return {
          x: (x * canvas.clientWidth) / bounds.width,
          y: (y * canvas.clientHeight) / bounds.height,
        };
      }
      return undefined;
    };
    const move = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === "touch") return;
      steering.pointer = event.buttons === 0 && isActive() ? point(event) : undefined;
    };
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.detail === 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !isActive() ||
        !(event.target instanceof Element) ||
        event.target.closest(foregroundControls)
      )
        return;
      if (window.getSelection()?.type === "Range") return;
      steering.click = point(event);
    };
    const unsubscribeActivity = subscribeDocumentActivity(() => {
      if (!isActive()) clear();
    });

    area.addEventListener("pointermove", move, { capture: true, passive: true });
    area.addEventListener("pointerleave", leave);
    area.addEventListener("click", click, { passive: true });
    motion.addEventListener("change", clear);
    return () => {
      unsubscribeActivity();
      steeringRef.current = undefined;
      area.removeEventListener("pointermove", move, true);
      area.removeEventListener("pointerleave", leave);
      area.removeEventListener("click", click);
      motion.removeEventListener("change", clear);
    };
  }, [canvasRef]);

  return <canvas ref={canvasRef} data-ascii-scene-canvas aria-hidden="true" />;
}
