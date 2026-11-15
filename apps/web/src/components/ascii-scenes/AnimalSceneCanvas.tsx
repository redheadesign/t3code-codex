import { paintAnimalScene } from "./animalCanvas";
import type { AnimalSceneId } from "./animalScenes";
import { useCanvasMotion } from "./useCanvasMotion";

export default function AnimalSceneCanvas({
  sceneId,
  appearance,
}: {
  readonly sceneId: AnimalSceneId;
  readonly appearance: "dark" | "light";
}) {
  const canvasRef = useCanvasMotion(
    (context, frame) => paintAnimalScene(context, { ...frame, sceneId }),
    appearance,
  );
  return <canvas ref={canvasRef} data-ascii-scene-canvas aria-hidden="true" />;
}
