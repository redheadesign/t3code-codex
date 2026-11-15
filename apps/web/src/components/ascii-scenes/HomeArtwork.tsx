import { lazy, Suspense, type CSSProperties } from "react";
import { create } from "zustand";
import { animalScenes, type AnimalSceneId } from "./animalScenes";
import "./homeArtwork.css";

const AnimalSceneCanvas = lazy(() => import("./AnimalSceneCanvas"));
const storageKey = "t3code:home-artwork";
const cellSizeStorageKey = "t3code:home-artwork-cell-size";
const defaultScene = animalScenes[0].id;
type HomeScene = AnimalSceneId | "off";

export const defaultAsciiCellSize = 100;
export const asciiCellSizes = [75, 80, 90, defaultAsciiCellSize, 110, 125, 150] as const;

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

function readCellSize() {
  try {
    const stored = Number(localStorage.getItem(cellSizeStorageKey));
    return asciiCellSizes.find((size) => size === stored) ?? defaultAsciiCellSize;
  } catch {
    return defaultAsciiCellSize;
  }
}

const useHomeScene = create<{ selection: HomeScene; cellSize: number }>(() => ({
  selection: readScene(),
  cellSize: readCellSize(),
}));

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

function setCellSize(cellSize: number) {
  if (!asciiCellSizes.some((preset) => preset === cellSize)) return;
  useHomeScene.setState({ cellSize });
  try {
    localStorage.setItem(cellSizeStorageKey, String(cellSize));
  } catch {
    // Keep the selection available for the current session.
  }
}

export function useAsciiCellSize() {
  return [useHomeScene((state) => state.cellSize), setCellSize] as const;
}

export function homeAccentStyle(swatch: string, selection: HomeScene): CSSProperties {
  return {
    "--home-scene-accent": swatch,
    "--home-scene-foreground": selection === "fox" ? "white" : "#111118",
  } as CSSProperties;
}

export function HomeArtwork({
  selection,
  appearance,
}: {
  readonly selection: HomeScene;
  readonly appearance: "dark" | "light";
}) {
  const cellSize = useHomeScene((state) => state.cellSize);
  if (selection === "off") return null;
  return (
    <div data-ascii-home-artwork>
      <Suspense fallback={null}>
        <AnimalSceneCanvas
          key={selection}
          sceneId={selection}
          appearance={appearance}
          cellScale={cellSize / 100}
        />
      </Suspense>
    </div>
  );
}
