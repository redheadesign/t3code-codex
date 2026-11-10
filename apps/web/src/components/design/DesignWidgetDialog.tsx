import { useState, type FormEvent } from "react";
import { useUiText } from "~/i18n";
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
import { Textarea } from "../ui/textarea";
import type { DesignAssetMeta, DesignPrototypeWidget } from "./designDocument";
import {
  DESIGN_WIDGET_SOURCE_LIMIT,
  parseDesignWidgetUrl,
  saveDesignWidgetSource,
  type DesignWidgetSource,
} from "./designWidgetSource";

export interface DesignWidgetDraft {
  name: string;
  widget: DesignPrototypeWidget;
  asset?: DesignAssetMeta;
}

export function DesignWidgetDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: { name: string; widget: DesignPrototypeWidget; source?: DesignWidgetSource } | null;
  onSave: (draft: DesignWidgetDraft) => void;
  onClose: () => void;
}) {
  const ui = useUiText();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.widget.kind ?? "url");
  const [url, setUrl] = useState(initial?.widget.kind === "url" ? initial.widget.url : "");
  const [source, setSource] = useState(initial?.source ?? { html: "", css: "", js: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = name.trim() || ui("Widget", "Виджет");
    if (kind === "url") {
      const href = parseDesignWidgetUrl(url);
      if (href) onSave({ name: title, widget: { kind, url: href } });
      else
        setError(ui("Enter an HTTP(S) address or iframe.", "Вставьте адрес HTTP(S) или iframe."));
      return;
    }
    if (!source.html.trim() && !source.js.trim()) {
      setError(ui("Add HTML or JavaScript.", "Добавьте HTML или JavaScript."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const asset = await saveDesignWidgetSource(title, source);
      onSave({ name: title, widget: { kind }, asset });
    } catch {
      setError(
        ui(
          "Couldn’t save the code. Try a shorter snippet.",
          "Код не сохранился. Попробуйте сократить его.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogPopup>
        <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>
              {initial
                ? ui("Edit widget", "Настроить виджет")
                : ui("Add widget", "Добавить виджет")}
            </DialogTitle>
            <DialogDescription>
              {ui("Run widgets in Present mode.", "Виджеты запускаются в режиме показа.")}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={kind === "url" ? "secondary" : "ghost"}
                aria-pressed={kind === "url"}
                onClick={() => {
                  setKind("url");
                  setError("");
                }}
              >
                {ui("Address", "Адрес")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={kind === "code" ? "secondary" : "ghost"}
                aria-pressed={kind === "code"}
                onClick={() => {
                  setKind("code");
                  setError("");
                }}
              >
                {ui("Code", "Код")}
              </Button>
            </div>
            <label className="grid gap-1.5 text-sm">
              {ui("Name", "Название")}
              <Input
                value={name}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {kind === "url" ? (
              <label className="grid gap-1.5 text-sm">
                {ui("Address or iframe", "Адрес или iframe")}
                <Textarea
                  rows={3}
                  value={url}
                  maxLength={12_000}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com"
                  spellCheck={false}
                />
              </label>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {ui(
                    "Tailwind CSS, GSAP and ScrollTrigger are available.",
                    "Доступны Tailwind CSS, GSAP и ScrollTrigger.",
                  )}
                </p>
                {(
                  [
                    ["html", "HTML"],
                    ["css", "CSS"],
                    ["js", "JavaScript"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="grid gap-1.5 text-sm">
                    {label}
                    <Textarea
                      rows={3}
                      value={source[field]}
                      maxLength={DESIGN_WIDGET_SOURCE_LIMIT}
                      spellCheck={false}
                      onChange={(event) => setSource({ ...source, [field]: event.target.value })}
                    />
                  </label>
                ))}
              </>
            )}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
              {ui("Cancel", "Отмена")}
            </Button>
            <Button type="submit" disabled={saving}>
              {initial ? ui("Save", "Сохранить") : ui("Add", "Добавить")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
