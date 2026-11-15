import { useEffect, useEffectEvent, useRef } from "react";
import { getDocumentActivity, subscribeDocumentActivity } from "~/lib/documentActivity";
import { observeResize } from "~/lib/observeResize";

interface CanvasFrame {
  readonly width: number;
  readonly height: number;
  readonly time: number;
  readonly appearance: "dark" | "light";
}

export function useCanvasMotion(
  paint: (context: CanvasRenderingContext2D, frame: CanvasFrame) => void,
  appearance: CanvasFrame["appearance"],
  duration = Infinity,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintFrame = useEffectEvent(paint);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the canvas buffer, activity and resize subscriptions, and frame timer
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    let time = 0;
    let previousTime = 0;
    let visible = false;
    let width = 0;
    let height = 0;
    let needsFrame = true;

    const stop = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    const draw = () => {
      if (width && height) {
        paintFrame(context, { width, height, time: motion.matches ? 0 : time, appearance });
      }
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
      if (!activity.focused || motion.matches || time >= duration) {
        stop();
        return;
      }
      if (timer !== undefined) return;
      previousTime = performance.now();
      timer = window.setInterval(() => {
        const now = performance.now();
        time = Math.min(duration, time + (now - previousTime) / 1000);
        previousTime = now;
        draw();
        if (time >= duration) stop();
      }, 1000 / 24);
    };
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const bufferWidth = Math.round(width * ratio);
      const bufferHeight = Math.round(height * ratio);
      if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
      if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
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
  }, [appearance, duration]);

  return canvasRef;
}
