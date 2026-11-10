import { useUiText } from "~/i18n";
import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuCheckboxItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
} from "../ui/menu";
import { isMacPlatform } from "../../lib/utils";

export const DESIGN_GRID_STEPS = [1, 2, 4, 8, 16] as const;
type GridStep = (typeof DESIGN_GRID_STEPS)[number];

export function DesignCanvasViewMenu({
  zoom,
  onZoom,
  onFit,
  rulers,
  onRulers,
  pixelGrid,
  onPixelGrid,
  pixelPreview,
  onPixelPreview,
  gridStep,
  onGridStep,
  guides,
  onGuides,
  outlines,
  onOutlines,
  propertyLabels,
  onPropertyLabels,
}: {
  zoom: number;
  onZoom: (zoom: number) => void;
  onFit: (selection: boolean) => void;
  rulers: boolean;
  onRulers: (value: boolean) => void;
  pixelGrid: boolean;
  onPixelGrid: (value: boolean) => void;
  pixelPreview: 0 | 1 | 2;
  onPixelPreview: (value: 0 | 1 | 2) => void;
  gridStep: GridStep;
  onGridStep: (value: GridStep) => void;
  guides: boolean;
  onGuides: (value: boolean) => void;
  outlines: boolean;
  onOutlines: (value: boolean) => void;
  propertyLabels: boolean;
  onPropertyLabels: (value: boolean) => void;
}) {
  const ui = useUiText();
  const [draft, setDraft] = useState("");
  const percent = Math.round(zoom * 10000) / 100;
  return (
    <Menu
      onOpenChange={(open) => {
        if (open) setDraft(`${percent}%`);
      }}
    >
      <MenuTrigger
        render={
          <Button
            size="xs"
            variant="ghost"
            aria-label={ui("Zoom and view options", "Вид и масштаб")}
          />
        }
      >
        <span className="tabular-nums">{Math.round(percent)}%</span>
        <ChevronDownIcon />
      </MenuTrigger>
      <MenuPopup align="end">
        <div className="p-2">
          <Input
            size="sm"
            aria-label={ui("Canvas zoom", "Масштаб холста")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const next = Number(draft.replace(/%$/u, "").trim());
              if (Number.isFinite(next) && next > 0) onZoom(next / 100);
            }}
          />
        </div>
        <MenuSeparator />
        <MenuItem onClick={() => onZoom(zoom * 1.2)}>
          {ui("Zoom in", "Увеличить")}
          <MenuShortcut>⇧ +</MenuShortcut>
        </MenuItem>
        <MenuItem onClick={() => onZoom(zoom / 1.2)}>
          {ui("Zoom out", "Уменьшить")}
          <MenuShortcut>⇧ −</MenuShortcut>
        </MenuItem>
        <MenuItem onClick={() => onFit(false)}>
          {ui("Zoom to fit", "Весь холст")}
          <MenuShortcut>⇧ 1</MenuShortcut>
        </MenuItem>
        <MenuItem onClick={() => onFit(true)}>
          {ui("Zoom to selection", "К выделению")}
          <MenuShortcut>⇧ 2</MenuShortcut>
        </MenuItem>
        {[50, 100, 200].map((value) => (
          <MenuItem key={value} onClick={() => onZoom(value / 100)}>
            Zoom to {value}%
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger>
            {ui("Pixel preview", "Пиксельный вид")}
            <MenuShortcut>{isMacPlatform(navigator.platform) ? "⌃ P" : "Ctrl Alt P"}</MenuShortcut>
          </MenuSubTrigger>
          <MenuSubPopup>
            <MenuRadioGroup
              value={pixelPreview}
              onValueChange={(value) => onPixelPreview(value as 0 | 1 | 2)}
            >
              {([0, 1, 2] as const).map((value) => (
                <MenuRadioItem key={value} value={value} closeOnClick>
                  <span className="flex items-center justify-between gap-8">
                    {value === 0 ? ui("Disabled", "Выкл.") : `${value}x`}
                    <MenuRadioItemIndicator />
                  </span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>
        <MenuCheckboxItem checked={pixelGrid} onCheckedChange={onPixelGrid}>
          <span className="flex w-full items-center justify-between gap-6">
            <span>{ui("Pixel grid", "Сетка пикселей")}</span>
            <MenuShortcut>⇧ '</MenuShortcut>
          </span>
        </MenuCheckboxItem>
        <MenuSub>
          <MenuSubTrigger>
            <span className="flex flex-1 items-center justify-between gap-6">
              {ui("Grid step", "Шаг сетки")}
              <MenuShortcut>{ui(`${gridStep} px`, `${gridStep} пкс`)}</MenuShortcut>
            </span>
          </MenuSubTrigger>
          <MenuSubPopup>
            <MenuRadioGroup
              value={gridStep}
              onValueChange={(value) => onGridStep(value as GridStep)}
            >
              {DESIGN_GRID_STEPS.map((step) => (
                <MenuRadioItem key={step} value={step} closeOnClick>
                  <span className="flex items-center justify-between gap-8">
                    {ui(`${step} px`, `${step} пкс`)}
                    <MenuRadioItemIndicator />
                  </span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>
        <MenuCheckboxItem checked={guides} onCheckedChange={onGuides}>
          {ui("Guides", "Направляющие")}
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={rulers} onCheckedChange={onRulers}>
          <span className="flex w-full items-center justify-between gap-6">
            <span>{ui("Rulers", "Линейки")}</span>
            <MenuShortcut>⇧ R</MenuShortcut>
          </span>
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={outlines} onCheckedChange={onOutlines}>
          <span className="flex w-full items-center justify-between gap-6">
            <span>{ui("Outlines", "Контуры")}</span>
            <MenuShortcut>⌘ Y</MenuShortcut>
          </span>
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={propertyLabels} onCheckedChange={onPropertyLabels}>
          {ui("Property labels", "Подписи свойств")}
        </MenuCheckboxItem>
      </MenuPopup>
    </Menu>
  );
}
