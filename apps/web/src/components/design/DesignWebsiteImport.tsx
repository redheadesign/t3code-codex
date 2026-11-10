import { useUiText } from "~/i18n";
import { normalizePreviewUrl } from "@t3tools/shared/preview";
import { useRef, useState } from "react";
import { previewBridge } from "../preview/previewBridge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import type { DesignDocument } from "./designDocument";
import { createDesignDocumentFromPreview, materializePreviewAssets } from "./previewToDesign";

export const canImportDesignWebsite = () =>
  typeof previewBridge?.captureWebsiteDesignSnapshot === "function";

export function DesignWebsiteImport({
  onImport,
  onClose,
}: {
  onImport: (document: DesignDocument) => Promise<void>;
  onClose: () => void;
}) {
  const ui = useUiText();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const importWebsite = async () => {
    const captureWebsite = previewBridge?.captureWebsiteDesignSnapshot;
    if (running.current || !captureWebsite) return;
    let address: string;
    try {
      address = normalizePreviewUrl(url);
      const parsed = new URL(address);
      if (parsed.username || parsed.password) throw new Error("URL contains credentials");
    } catch {
      setError("Enter an HTTP or HTTPS website address without credentials.");
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const capture = await captureWebsite(address);
      if (capture.nodes.length === 0) {
        setError("The website did not render any layers to import.");
        return;
      }
      const assets = await materializePreviewAssets(capture, { website: true });
      await onImport(
        createDesignDocumentFromPreview({
          url: capture.url,
          title: capture.title.trim() || new URL(capture.url).hostname,
          viewport: {
            _tag: "freeform",
            width: capture.viewportWidth,
            height: capture.viewportHeight,
          },
          colorScheme: "system",
          sourceRevision: new Date().toISOString(),
          capture,
          website: true,
          assetIdsByNodeId: assets.assetIdsByNodeId,
          assetMetadata: assets.assets,
          models: assets.models,
        }),
      );
      if (capture.truncated) {
        toastManager.add({
          type: "warning",
          title: "Website imported partially",
          description: "The first 10,000 layers were imported.",
        });
      }
      if (assets.unembeddedImages > 0) {
        toastManager.add({
          type: "warning",
          title: ui("Some images could not be saved", "Часть изображений не сохранилась"),
          description: ui(
            "Linked images load from the original site when available.",
            "Изображения по ссылкам загрузятся, если доступны на сайте.",
          ),
        });
      }
      if (capture.has3DContent) {
        toastManager.add({
          type: assets.models.length ? "success" : "warning",
          title: assets.models.length
            ? ui("3D models imported", "3D-модели добавлены")
            : ui("3D is available on the original site", "3D доступно в оригинале"),
          description: assets.models.length
            ? ui(
                "Select a 3D layer to edit it. Open the original site for its shaders and interactions.",
                "Выберите 3D-слой для правки. Шейдеры и интерактивность доступны в оригинале.",
              )
            : capture.modelHostNodeIds?.length
              ? ui(
                  "Add your model to a 3D layer or open the original site in Present.",
                  "Добавьте свою модель в 3D-слой или откройте «Оригинал» в режиме показа.",
                )
              : ui(
                  "Open Original site in Present to see the live scene.",
                  "В режиме показа откройте «Оригинал», чтобы посмотреть сцену.",
                ),
        });
      }
      onClose();
    } catch {
      setError("Could not import this website. Check that the address opens in Preview.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !running.current) onClose();
      }}
    >
      <DialogPopup showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{ui("Import website", "Импорт сайта")}</DialogTitle>
          <DialogDescription>
            {ui(
              "Import editable layers and compatible 3D models into a new design file.",
              "Перенесите слои страницы и совместимые 3D-модели в новый макет.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void importWebsite();
          }}
        >
          <DialogPanel>
            <label className="grid gap-2 text-sm">
              {ui("Website address", "Адрес сайта")}
              <Input
                autoFocus
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                disabled={busy}
                autoComplete="url"
                inputMode="url"
                spellCheck={false}
                aria-invalid={error !== null}
              />
            </label>
            {error ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {ui("Cancel", "Отмена")}
            </Button>
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy
                ? ui("Importing website", "Импорт сайта…")
                : ui("Import website", "Импорт сайта")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
