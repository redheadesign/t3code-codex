import { useCanvasMotion } from "./useCanvasMotion";

export function ComposerDust({ appearance }: { readonly appearance: "dark" | "light" }) {
  const canvasRef = useCanvasMotion(
    (context, { width, height, time, appearance }) => {
      context.clearRect(0, 0, width, height);
      const count = Math.min(24, Math.floor((width * height) / 3900));
      context.fillStyle = appearance === "dark" ? "#e8ebf7" : "#495579";
      for (let index = 0; index < count; index++) {
        const phase = (((time / (4 + (index % 5)) + index * 0.618) % 1) + 1) % 1;
        const x = 12 + ((index * 0.7549) % 1) * (width - 24);
        const start = index % 3 === 0 ? height - 5 : 14 + ((index * 0.5698) % 1) * (height - 20);
        const y = start - phase * 10;
        context.globalAlpha = Math.sin(phase * Math.PI) * 0.38;
        context.beginPath();
        context.arc(x, y, index % 4 === 0 ? 0.95 : 0.65, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    },
    20,
    appearance,
  );
  return <canvas ref={canvasRef} data-ascii-composer-dust aria-hidden="true" />;
}
