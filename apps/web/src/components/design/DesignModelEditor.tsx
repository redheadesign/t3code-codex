import { EyeIcon, EyeOffIcon, FolderOpenIcon } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { useUiText } from "~/i18n";
import { Button } from "../ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "../ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { DesignInspectorColor } from "./DesignInspectorColor";
import { DesignModelPreview } from "./DesignModelPreview";
import { DesignNumberField } from "./DesignNumberField";
import type { DesignAssetMeta, DesignModelSettings } from "./designDocument";
import type { DesignModelDetails } from "./DesignModelViewport";
import {
  DESIGN_MODEL_ACCEPT,
  DesignModelAssetError,
  prepareDesignModelAsset,
} from "./designModelAsset";

export function designModelImportError(error: unknown, ui: ReturnType<typeof useUiText>) {
  if (error instanceof DesignModelAssetError) {
    if (error.reason === "too-large")
      return ui("Choose a model under 8 MB.", "Выберите модель до 8 МБ.");
    if (error.reason === "external-resource")
      return ui(
        "Choose a model with embedded textures and buffers.",
        "Нужна модель со встроенными текстурами и данными.",
      );
  }
  return ui(
    "Couldn’t read the model. Try a GLB or glTF file.",
    "Модель не открылась. Попробуйте файл GLB или glTF.",
  );
}

export function DesignModelEditor({
  name,
  assetId,
  assets,
  initial,
  onClose,
  onSave,
}: {
  name: string;
  assetId: string | null;
  assets: readonly DesignAssetMeta[];
  initial: DesignModelSettings;
  onClose: () => void;
  onSave: (settings: DesignModelSettings, replacement: DesignAssetMeta | null) => void;
}) {
  const ui = useUiText();
  const input = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState(initial);
  const [details, setDetails] = useState<DesignModelDetails | null>(null);
  const [replacement, setReplacement] = useState<DesignAssetMeta | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (update: Partial<DesignModelSettings>) =>
    setSettings((previous) => ({ ...previous, ...update }));
  const material = details?.materials.find(({ id }) => id === materialId) ?? details?.materials[0];
  const currentAssetId = replacement?.assetId ?? assetId;
  const hidden = new Set(settings.hiddenLayers);
  const selectModel = (next: DesignAssetMeta) => {
    if (next.assetId === currentAssetId) return;
    setDetails(null);
    setMaterialId(null);
    setError(null);
    patch({ camera: null, animation: null, materialColors: {}, hiddenLayers: [] });
    setReplacement(next);
  };
  const replace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      selectModel(await prepareDesignModelAsset(file, file.name));
    } catch (error) {
      setError(designModelImportError(error, ui));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogPopup
        variant="media"
        className="h-[min(82dvh,820px)] w-[min(92vw,1160px)]"
        bottomStickOnMobile={false}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-background text-foreground">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 pe-12">
            <div className="min-w-0">
              <DialogTitle>{ui("3D scene", "3D-сцена")}</DialogTitle>
              <DialogDescription>
                <span className="block truncate">{replacement?.name ?? name}</span>
              </DialogDescription>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => input.current?.click()}
            >
              <FolderOpenIcon />
              {currentAssetId
                ? ui("Replace model", "Заменить модель")
                : ui("Choose model", "Выбрать модель")}
            </Button>
          </header>
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(9rem,2fr)_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_17rem] sm:grid-rows-1">
            <div className="relative min-h-0 min-w-0 overflow-hidden bg-muted">
              {currentAssetId ? (
                <>
                  <DesignModelPreview
                    key={currentAssetId}
                    assetId={currentAssetId}
                    label={name}
                    settings={settings}
                    interactive
                    onDetails={setDetails}
                  />
                  <p className="pointer-events-none absolute inset-x-0 bottom-0 px-3 py-2 text-center text-2xs text-muted-foreground">
                    {ui("Drag to orbit · scroll to zoom", "Вращение мышью · зум колёсиком")}
                  </p>
                </>
              ) : (
                <p className="grid size-full place-content-center px-6 text-center text-sm text-muted-foreground">
                  {ui(
                    "Choose a GLB or glTF model for this layer.",
                    "Выберите модель GLB или glTF для этого слоя.",
                  )}
                </p>
              )}
            </div>
            <aside
              aria-label={ui("Scene settings", "Настройки сцены")}
              className="min-h-0 space-y-4 overflow-auto border-t border-border p-3 sm:border-s sm:border-t-0"
            >
              {assets.some(({ assetId }) => assetId !== currentAssetId) ? (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold">{ui("Model", "Модель")}</h3>
                  <Select
                    value={
                      assets.some(({ assetId }) => assetId === currentAssetId)
                        ? currentAssetId
                        : null
                    }
                    onValueChange={(value) => {
                      const next = assets.find(({ assetId }) => assetId === value);
                      if (next) selectModel(next);
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={ui("Model from assets", "Модель из ресурсов")}
                    >
                      <SelectValue placeholder={ui("Choose from assets", "Выбрать из ресурсов")} />
                    </SelectTrigger>
                    <SelectPopup>
                      {assets.map(({ assetId, name }) => (
                        <SelectItem key={assetId} value={assetId}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </section>
              ) : null}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold">{ui("View", "Вид")}</h3>
                {details?.cameras.length ? (
                  <Select
                    value={settings.camera ?? "orbit"}
                    onValueChange={(value) => patch({ camera: value === "orbit" ? null : value })}
                  >
                    <SelectTrigger size="sm" aria-label={ui("Camera", "Камера")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="orbit">
                        {ui("Orbit camera", "Орбитальная камера")}
                      </SelectItem>
                      {details.cameras.map(({ id, name }) => (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                ) : null}
                <div className="grid grid-cols-2 gap-1.5">
                  <DesignNumberField
                    compact
                    label={ui("Rotation", "Поворот")}
                    value={settings.rotation ?? 0}
                    min={-180}
                    max={180}
                    suffix="°"
                    onChange={(rotation) => patch({ rotation })}
                  />
                  <DesignNumberField
                    compact
                    label={ui("Zoom", "Зум")}
                    value={Math.round((settings.zoom ?? 1) * 100)}
                    min={25}
                    max={400}
                    suffix="%"
                    onChange={(zoom) => patch({ zoom: zoom / 100 })}
                  />
                </div>
                <div className="grid grid-cols-[1fr_7rem] items-center gap-2 text-xs">
                  <span>{ui("Background", "Фон")}</span>
                  <DesignInspectorColor
                    label={ui("Background", "Фон")}
                    value={settings.background ?? "#1c2029"}
                    onChange={(background) => patch({ background })}
                  />
                </div>
              </section>
              {details?.animations.length ? (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold">{ui("Animation", "Анимация")}</h3>
                  <Select
                    value={settings.animation ?? "still"}
                    onValueChange={(value) =>
                      patch({ animation: value === "still" ? null : value })
                    }
                  >
                    <SelectTrigger size="sm" aria-label={ui("Animation", "Анимация")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="still">{ui("Paused", "Пауза")}</SelectItem>
                      {details.animations.map(({ id, name }) => (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </section>
              ) : null}
              {material ? (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold">{ui("Materials", "Материалы")}</h3>
                  <Select value={material.id} onValueChange={setMaterialId}>
                    <SelectTrigger size="sm" aria-label={ui("Material", "Материал")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {details?.materials.map(({ id, name }) => (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <div className="grid grid-cols-[1fr_7rem] items-center gap-2 text-xs">
                    <span>{ui("Color", "Цвет")}</span>
                    <DesignInspectorColor
                      label={ui("Material color", "Цвет материала")}
                      value={settings.materialColors?.[material.id] ?? material.color}
                      onChange={(color) =>
                        patch({
                          materialColors: { ...settings.materialColors, [material.id]: color },
                        })
                      }
                    />
                  </div>
                </section>
              ) : null}
              {details?.layers.length ? (
                <section className="space-y-1">
                  <h3 className="text-xs font-semibold">{ui("Objects", "Объекты")}</h3>
                  <ul className="space-y-0.5">
                    {details.layers.map(({ id, name, depth }) => (
                      <li
                        key={id}
                        className="flex min-w-0 items-center gap-1"
                        style={{ paddingInlineStart: Math.min(depth, 8) * 8 }}
                      >
                        <Button
                          size="icon-xs"
                          variant="ghost-muted"
                          aria-label={
                            hidden.has(id)
                              ? `${ui("Show", "Показать")} ${name}`
                              : `${ui("Hide", "Скрыть")} ${name}`
                          }
                          onClick={() =>
                            patch({
                              hiddenLayers: hidden.has(id)
                                ? [...hidden].filter((layer) => layer !== id)
                                : [...hidden, id],
                            })
                          }
                        >
                          {hidden.has(id) ? <EyeOffIcon /> : <EyeIcon />}
                        </Button>
                        <span className="truncate text-xs">{name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </aside>
          </div>
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-2.5">
            {error ? (
              <p role="alert" className="me-auto text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <Button size="sm" variant="secondary" disabled={loading} onClick={onClose}>
              {ui("Cancel", "Отмена")}
            </Button>
            <Button
              size="sm"
              disabled={loading || !currentAssetId}
              onClick={() => onSave(settings, replacement)}
            >
              {ui("Save", "Сохранить")}
            </Button>
          </footer>
          <input
            ref={input}
            type="file"
            accept={DESIGN_MODEL_ACCEPT}
            className="hidden"
            aria-label={ui("Replacement model", "Файл новой модели")}
            onChange={(event) => void replace(event)}
          />
        </div>
      </DialogPopup>
    </Dialog>
  );
}
