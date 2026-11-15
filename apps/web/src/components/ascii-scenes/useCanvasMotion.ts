import { useEffect, useEffectEvent, useRef } from "react";
import { getDocumentActivity, subscribeDocumentActivity } from "~/lib/documentActivity";
import { observeResize } from "~/lib/observeResize";

interface CanvasFrame {
  readonly width: number;
  readonly height: number;
  readonly time: number;
  readonly appearance: "dark" | "light";
}

const maxBackingPixels = 2_500_000;

export function useCanvasMotion(
  paint: (context: CanvasRenderingContext2D, frame: CanvasFrame) => void,
  appearance: CanvasFrame["appearance"],
  framesPerSecond = 30,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintFrame = useEffectEvent(paint);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the canvas buffer, frame loop, and activity and resize subscriptions
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frameInterval = 1000 / framesPerSecond;
    let frameId: number | undefined;
    let time = 0;
    let previousPaint = 0;
    let nextPaint = 0;
    let visible = false;
    let width = 0;
    let height = 0;
    let needsFrame = true;

    const stop = () => {
      if (frameId === undefined) return;
      window.cancelAnimationFrame(frameId);
      frameId = undefined;
    };
    const draw = () => {
      if (width && height) {
        paintFrame(context, { width, height, time: motion.matches ? 0 : time, appearance });
      }
    };
    const animate = (now: number) => {
      const lateness = now + 0.5 - nextPaint;
      if (lateness >= 0) {
        time += (now - previousPaint) / 1000;
        previousPaint = now;
        nextPaint += (1 + Math.floor(lateness / frameInterval)) * frameInterval;
        draw();
      }
      frameId = window.requestAnimationFrame(animate);
    };
    const update = () => {
      const activity = getDocumentActivity();
      if (!activity.visible || !visible || !width || !height) {
        stop();
        return;
      }
      if (needsFrame) {
        draw();
        needsFrame = false;
      }
      if (!activity.focused || motion.matches) {
        stop();
        return;
      }
      if (frameId !== undefined) return;
      previousPaint = performance.now();
      nextPaint = previousPaint + frameInterval;
      frameId = window.requestAnimationFrame(animate);
    };
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        1.5,
        Math.sqrt(maxBackingPixels / (width * height)),
      );
      const bufferWidth = Math.floor(width * ratio);
      const bufferHeight = Math.floor(height * ratio);
      if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
      if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
      if (width && height)
        context.setTransform(bufferWidth / width, 0, 0, bufferHeight / height, 0, 0);
      needsFrame = true;
      update();
    };
    const onMotionChange = () => {
      needsFrame = true;
      update();
    };
    const unsubscribeActivity = subscribeDocumentActivity(update);
    const unobserveResize = observeResize([canvas], resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting === true;
      update();
    });
    intersectionObserver.observe(canvas);
    motion.addEventListener("change", onMotionChange);
    return () => {
      stop();
      unsubscribeActivity();
      unobserveResize();
      intersectionObserver.disconnect();
      motion.removeEventListener("change", onMotionChange);
    };
  }, [appearance, framesPerSecond]);

  return canvasRef;
}
