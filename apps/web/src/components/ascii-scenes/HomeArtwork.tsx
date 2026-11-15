import { lazy, Suspense, type CSSProperties } from "react";
import { create } from "zustand";
import { animalScenes, type AnimalSceneId } from "./animalScenes";
import "./homeArtwork.css";

const AnimalSceneCanvas = lazy(() => import("./AnimalSceneCanvas"));
const storageKey = "t3code:home-artwork";
const defaultScene = animalScenes[0].id;
type HomeScene = AnimalSceneId | "off";

function resolveScene(value: string | null | undefined): HomeScene {
  if (value === "off") return value;
  return animalScenes.find((scene) => scene.id === value)?.id ?? defaultScene;
}

function readScene(): HomeScene {
  try {
    return resolveScene(localStorage.getItem(storageKey));
  } catch {
    return defaultScene;
  }
}

const useHomeScene = create<{ selection: HomeScene }>(() => ({ selection: readScene() }));

function setScene(selection: HomeScene) {
  useHomeScene.setState({ selection });
  try {
    localStorage.setItem(storageKey, selection);
  } catch {
    // The setting still applies for this session when storage is unavailable.
  }
}

export function useHomeArtwork() {
  const selection = useHomeScene((state) => state.selection);
  const swatch = animalScenes.find((scene) => scene.id === selection)?.swatch;
  return { selection, setScene, swatch };
}

export function homeAccentStyle(swatch: string): CSSProperties {
  return { "--home-scene-accent": swatch, "--home-scene-foreground": "#111118" } as CSSProperties;
}

export function HomeArtwork({
  selection,
  appearance,
}: {
  readonly selection: HomeScene;
  readonly appearance: "dark" | "light";
}) {
  if (selection === "off") return null;
  return (
    <div data-ascii-home-artwork>
      <Suspense fallback={null}>
        <AnimalSceneCanvas key={selection} sceneId={selection} appearance={appearance} />
      </Suspense>
    </div>
  );
}
