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
      const assets = await materializePreviewAssets(capture);
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
          assetIdsByNodeId: assets.assetIdsByNodeId,
          assetMetadata: assets.assets,
        }),
      );
      if (capture.truncated) {
        toastManager.add({
          type: "warning",
          title: "Website imported partially",
          description: "The first 10,000 layers were imported.",
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
          <DialogTitle>Import website</DialogTitle>
          <DialogDescription>
            Capture the page as editable layers in a new design file.
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
              Website address
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
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy ? "Importing website" : "Import website"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
