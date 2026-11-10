import { useState } from "react";
import { useUiText } from "~/i18n";
import { Button } from "../ui/button";
import type { DesignPrototypeWidget } from "./designDocument";
import { designWidgetUrl, readDesignWidgetSource } from "./designWidgetSource";

export function DesignWidgetPreview({
  widget,
  assetId,
  title,
}: {
  widget: DesignPrototypeWidget;
  assetId: string | null | undefined;
  title: string;
}) {
  const ui = useUiText();
  const href = widget.kind === "url" ? designWidgetUrl(widget.url) : null;
  const [preview, setPreview] = useState<{ srcDoc?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = async () => {
    setFailed(false);
    if (href && new URL(href).origin !== window.location.origin) {
      setPreview({});
      return;
    }
    if (widget.kind !== "code" || !assetId) {
      setFailed(true);
      return;
    }
    setLoading(true);
    try {
      const [source, designWidgetSrcDoc] = await Promise.all([
        readDesignWidgetSource(assetId),
        import("./designWidgetRuntime").then(({ designWidgetSrcDoc }) => designWidgetSrcDoc),
      ]);
      setPreview({ srcDoc: designWidgetSrcDoc(source) });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-background text-foreground">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        <Button
          size="xs"
          variant="secondary"
          disabled={loading}
          onClick={() => (preview ? setPreview(null) : void start())}
        >
          {preview ? ui("Stop", "Остановить") : ui("Run widget", "Запустить виджет")}
        </Button>
        {href ? (
          <Button
            size="xs"
            variant="ghost"
            render={<a href={href} target="_blank" rel="noopener noreferrer" />}
          >
            {ui("Open original", "Открыть оригинал")}
          </Button>
        ) : null}
      </div>
      {preview ? (
        <iframe
          title={title}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          ref={(frame) => {
            if (frame && href && !frame.hasAttribute("src")) {
              frame.setAttribute("credentialless", "");
              frame.src = href;
            }
          }}
          srcDoc={preview.srcDoc}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          allow="camera 'none'; microphone 'none'; geolocation 'none'"
        />
      ) : (
        <div className="grid flex-1 place-content-center p-3 text-center text-xs text-muted-foreground">
          <span role="status">
            {failed
              ? ui("The widget couldn’t start.", "Виджет не запустился.")
              : loading
                ? ui("Loading widget…", "Загрузка виджета…")
                : href
                  ? ui(
                      "Some sites open only in a browser.",
                      "Некоторые сайты открываются только в браузере.",
                    )
                  : title}
          </span>
        </div>
      )}
    </div>
  );
}
