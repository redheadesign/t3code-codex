import { useEffect, useEffectEvent, useRef } from "react";
import { observeResize } from "~/lib/observeResize";

interface CanvasFrame {
  readonly width: number;
  readonly height: number;
  readonly time: number;
  readonly appearance: "dark" | "light";
}

export function useCanvasMotion(
  paint: (context: CanvasRenderingContext2D, frame: CanvasFrame) => void,
  duration: number,
  appearance: CanvasFrame["appearance"],
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintFrame = useEffectEvent(paint);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the canvas buffer, resize and visibility observers, and bounded paint timer
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
      stop();
      if (document.hidden || !visible || !width || !height) return;
      draw();
      if (motion.matches || time >= duration) return;
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
      update();
    };
    const unobserveResize = observeResize([canvas], resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting === true;
      update();
    });
    intersectionObserver.observe(canvas);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    return () => {
      stop();
      unobserveResize();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
    };
  }, [appearance, duration]);

  return canvasRef;
}
