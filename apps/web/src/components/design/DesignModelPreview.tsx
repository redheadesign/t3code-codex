import { lazy, Suspense, useState, type ComponentProps } from "react";
import { useUiText } from "~/i18n";
import { Button } from "../ui/button";
import type { DesignModelViewport } from "./DesignModelViewport";

const ModelViewport = lazy(() =>
  import("./DesignModelViewport").then(({ DesignModelViewport }) => ({
    default: DesignModelViewport,
  })),
);

export function DesignModelPreview(props: ComponentProps<typeof DesignModelViewport>) {
  const ui = useUiText();
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className="grid size-full place-items-center bg-muted text-xs text-muted-foreground"
        >
          {ui("Loading 3D…", "Загрузка 3D…")}
        </div>
      }
    >
      <ModelViewport {...props} />
    </Suspense>
  );
}

export function DesignModelPlayback(props: ComponentProps<typeof DesignModelViewport>) {
  const ui = useUiText();
  const [running, setRunning] = useState(false);
  return (
    <div className="absolute inset-0 overflow-hidden" onClick={(event) => event.stopPropagation()}>
      {running ? <DesignModelPreview {...props} interactive /> : null}
      <div
        className={
          running ? "absolute end-2 top-2" : "absolute inset-0 grid place-items-center bg-muted"
        }
      >
        <Button size="xs" variant="secondary" onClick={() => setRunning(!running)}>
          {running ? ui("Stop 3D", "Остановить 3D") : ui("Run 3D", "Запустить 3D")}
        </Button>
      </div>
    </div>
  );
}
