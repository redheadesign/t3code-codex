import { useEffect, useRef, useState } from "react";
import { useUiText } from "~/i18n";
import { useStableCallback } from "../../hooks/useStableCallback";
import type { DesignModelSettings } from "./designDocument";
import { DesignModelAssetError } from "./designModelAsset";
import {
  createDesignModelRuntime,
  DesignModelGraphicsError,
  type DesignModelDetails,
} from "./designModelRuntime";

export type { DesignModelDetails } from "./designModelRuntime";

type ModelStatus = "ready" | "unavailable" | "external-resource" | "graphics";

export function DesignModelViewport({
  assetId,
  label,
  settings,
  interactive = false,
  onDetails,
}: {
  assetId: string;
  label: string;
  settings: DesignModelSettings;
  interactive?: boolean;
  onDetails?: ((details: DesignModelDetails) => void) | undefined;
}) {
  const ui = useUiText();
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Awaited<ReturnType<typeof createDesignModelRuntime>> | null>(null);
  const [result, setResult] = useState<{ assetId: string; status: ModelStatus } | null>(null);
  const reportLoaded = useStableCallback((loaded: NonNullable<typeof runtime.current>) => {
    loaded.update(settings, interactive);
    onDetails?.(loaded.details);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- This viewport owns the WebGL renderer and resources for its mounted asset.
  useEffect(() => {
    if (!host.current) return;
    const controller = new AbortController();
    void createDesignModelRuntime(host.current, assetId, controller.signal).then(
      (loaded) => {
        if (controller.signal.aborted) {
          loaded.dispose();
          return;
        }
        runtime.current = loaded;
        reportLoaded(loaded);
        setResult({ assetId, status: "ready" });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const status =
          error instanceof DesignModelGraphicsError
            ? "graphics"
            : error instanceof DesignModelAssetError && error.reason === "external-resource"
              ? "external-resource"
              : "unavailable";
        setResult({ assetId, status });
      },
    );
    return () => {
      controller.abort();
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, [assetId, reportLoaded]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Apply edited settings to the mounted WebGL scene without reloading its model.
  useEffect(() => {
    runtime.current?.update(settings, interactive);
  }, [settings, interactive]);

  const status = result?.assetId === assetId ? result.status : "loading";
  return (
    <div
      className="relative size-full overflow-hidden"
      data-design-model-viewport=""
      data-state={status}
    >
      <div
        ref={host}
        role={interactive ? "group" : "img"}
        aria-label={label}
        className="absolute inset-0"
      />
      {status !== "ready" ? (
        <div
          className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-muted-foreground"
          role="status"
        >
          {status === "loading"
            ? ui("Loading model…", "Загружаем модель…")
            : status === "graphics"
              ? ui("3D preview requires WebGL 2.", "Для 3D-просмотра нужен WebGL 2.")
              : status === "external-resource"
                ? ui(
                    "Use a model with embedded resources.",
                    "Нужна модель со встроенными ресурсами.",
                  )
                : ui("Couldn’t open the 3D model.", "Не удалось открыть 3D-модель.")}
        </div>
      ) : null}
    </div>
  );
}
