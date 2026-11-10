import { useUiText } from "~/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { DesignNumberField } from "./DesignNumberField";
import type { DesignDocument } from "./designDocument";
import { createDesignDocumentFromMarkup } from "./previewToDesign";
import { materializeDesignDocumentImages } from "./designImage";

export function DesignReactPasteDialog({
  viewport,
  onImport,
  onClose,
}: {
  viewport: { width: number; height: number };
  onImport: (document: DesignDocument) => void;
  onClose: () => void;
}) {
  const ui = useUiText();
  const [code, setCode] = useState("");
  const [width, setWidth] = useState(Math.min(8192, Math.max(16, viewport.width)));
  const [height, setHeight] = useState(Math.min(8192, Math.max(16, viewport.height)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Cancel sandbox rendering and image downloads when the paste dialog leaves the DOM.
  useEffect(() => () => controller.current?.abort(), []);
  const submit = async () => {
    if (busy || !code.trim()) return;
    const task = new AbortController();
    controller.current = task;
    setBusy(true);
    setError(null);
    try {
      const captured = await createDesignDocumentFromMarkup({
        markup: code,
        mode: "react",
        viewport: { width, height },
        signal: task.signal,
      });
      const imported = await materializeDesignDocumentImages(captured, task.signal);
      if (task.signal.aborted) return;
      onImport(imported);
      onClose();
    } catch (error) {
      if (task.signal.aborted) return;
      setError(error instanceof Error ? error.message : "Could not import React.");
    }
    setBusy(false);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{ui("Paste as React", "Вставить React")}</DialogTitle>
          <DialogDescription>
            {ui(
              "Paste JSX or a default component. The rendered result becomes editable layers.",
              "Вставьте JSX или компонент с default export. Результат станет слоями.",
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <DesignNumberField
                label={ui("Viewport width", "Ширина окна")}
                value={width}
                onChange={setWidth}
                min={16}
                max={8192}
              />
              <DesignNumberField
                label={ui("Viewport height", "Высота окна")}
                value={height}
                onChange={setHeight}
                min={16}
                max={8192}
              />
            </div>
            <label className="grid gap-2 text-xs">
              {ui("React code", "Код React")}
              <textarea
                autoFocus
                aria-label={ui("React code", "Код React")}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={
                  "export default function App() {\n  return <button>Continue</button>;\n}"
                }
                className="h-56 w-full resize-y rounded-lg border border-input bg-background p-3 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
            </label>
          </fieldset>
          {error ? (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {busy ? (
            <p role="status" className="mt-3 text-xs text-muted-foreground">
              {ui("Rendering React and collecting images…", "Собираем слои и изображения…")}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {ui("Cancel", "Отмена")}
          </Button>
          <Button disabled={busy || !code.trim()} onClick={() => void submit()}>
            {busy ? ui("Importing…", "Импорт…") : ui("Import to canvas", "Импорт на холст")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
