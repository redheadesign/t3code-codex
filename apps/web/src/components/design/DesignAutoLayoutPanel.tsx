import { useUiText } from "~/i18n";
import { useState } from "react";
import {
  Columns2Icon,
  Rows2Icon,
  ScanIcon,
  SlidersHorizontalIcon,
  WrapTextIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { DesignNumberField } from "./DesignNumberField";
import type { DesignLayoutModel } from "./designDocument";

export function DesignAutoLayoutPanel({
  model,
  onChange,
}: {
  model: DesignLayoutModel;
  onChange: (update: DesignLayoutModel) => void;
}) {
  const ui = useUiText();
  const [individualPadding, setIndividualPadding] = useState(false);
  const patch = (update: Partial<DesignLayoutModel>) => onChange({ ...model, ...update });
  const row = model.direction === "row" || model.kind === "grid";
  const sides = {
    top: model.paddingTop ?? model.padding ?? 0,
    right: model.paddingRight ?? model.padding ?? 0,
    bottom: model.paddingBottom ?? model.padding ?? 0,
    left: model.paddingLeft ?? model.padding ?? 0,
  };
  const alignments = ["start", "center", "end"] as const;
  return (
    <div className="space-y-2" aria-label={ui("Auto layout settings", "Параметры авторазметки")}>
      <div className="flex items-start gap-2">
        <div
          role="group"
          aria-label={ui("Auto layout alignment", "Выравнивание")}
          className="grid size-16 shrink-0 grid-cols-3 grid-rows-3 rounded-md bg-input/25 p-1"
        >
          {alignments.flatMap((vertical) =>
            alignments.map((horizontal) => {
              const align = row ? vertical : horizontal;
              const justify = row ? horizontal : vertical;
              const selected =
                (model.align ?? "start") === align && (model.justify ?? "start") === justify;
              const name = `${{ start: "top", center: "center", end: "bottom" }[vertical]} ${{ start: "left", center: "center", end: "right" }[horizontal]}`;
              return (
                <button
                  key={`${vertical}-${horizontal}`}
                  type="button"
                  aria-label={`Align layout ${name}`}
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-0 items-center justify-center rounded-sm p-0 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                    selected
                      ? "bg-background text-primary shadow-xs"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                  onClick={() =>
                    patch({
                      align,
                      justify,
                      counterAxisAlign:
                        align === "start" ? "min" : align === "end" ? "max" : "center",
                    })
                  }
                >
                  <span
                    aria-hidden="true"
                    className={cn("rounded-xs", selected ? "h-2.5 w-1" : "size-0.5 bg-current")}
                    style={selected ? { background: "currentColor" } : undefined}
                  />
                </button>
              );
            }),
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-2">
          <DesignNumberField
            compact
            label={ui("Gap", "Интервал")}
            prefix={row ? <Columns2Icon className="size-3" /> : <Rows2Icon className="size-3" />}
            value={model.gap ?? 0}
            min={0}
            onChange={(gap) => patch({ gap })}
          />
          <div className="flex items-center justify-between">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={ui("Wrap auto layout", "Перенос элементов")}
                    aria-pressed={model.wrap === true}
                    onClick={() => patch({ wrap: !model.wrap })}
                  />
                }
              >
                <WrapTextIcon />
              </TooltipTrigger>
              <TooltipPopup>{ui("Wrap", "Перенос")}</TooltipPopup>
            </Tooltip>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={ui("Auto layout advanced settings", "Ещё параметры")}
                  />
                }
              >
                <SlidersHorizontalIcon />
              </PopoverTrigger>
              <PopoverPopup side="left" align="start" width="sm" padding="compact">
                <div className="space-y-3">
                  <h4 className="text-xs font-medium">{ui("Auto layout", "Авторазметка")}</h4>
                  <label className="grid gap-1 text-2xs text-muted-foreground">
                    {ui("Spacing mode", "Интервалы")}
                    <Select
                      value={model.justify === "space-between" ? "auto" : "packed"}
                      onValueChange={(value) => {
                        if (value !== null)
                          patch({ justify: value === "auto" ? "space-between" : "start" });
                      }}
                    >
                      <SelectTrigger
                        size="xs"
                        width="fluid"
                        aria-label={ui("Spacing mode", "Интервалы")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectItem value="packed">{ui("Packed", "Плотно")}</SelectItem>
                        <SelectItem value="auto">{ui("Auto", "Авто")}</SelectItem>
                      </SelectPopup>
                    </Select>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={model.align === "stretch"}
                      onCheckedChange={(stretch) =>
                        patch({
                          align: stretch ? "stretch" : "start",
                          counterAxisAlign: stretch ? "stretch" : "min",
                        })
                      }
                    />
                    {ui("Stretch children", "Растянуть слои")}
                  </label>
                  <label className="grid gap-1 text-2xs text-muted-foreground">
                    {ui("Counter-axis alignment", "По поперечной оси")}
                    <Select
                      value={model.counterAxisAlign ?? "min"}
                      onValueChange={(value) => {
                        if (value !== null) patch({ counterAxisAlign: value });
                      }}
                    >
                      <SelectTrigger
                        size="xs"
                        width="fluid"
                        aria-label={ui("Counter-axis alignment", "По поперечной оси")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        {(["min", "center", "max", "baseline", "stretch"] as const).map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </label>
                </div>
              </PopoverPopup>
            </Popover>
          </div>
        </div>
      </div>
      {model.wrap || model.kind === "grid" ? (
        <DesignNumberField
          compact
          label={ui("Counter-axis spacing", "Поперечный отступ")}
          prefix={<Rows2Icon className="size-3" />}
          value={model.counterAxisSpacing ?? model.gap ?? 0}
          min={0}
          onChange={(counterAxisSpacing) => patch({ counterAxisSpacing })}
        />
      ) : null}
      <div className="flex items-center gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          {individualPadding ? (
            (["top", "right", "bottom", "left"] as const).map((side) => (
              <DesignNumberField
                key={side}
                compact
                label={`Padding ${side}`}
                prefix={side[0]!.toUpperCase()}
                value={sides[side]}
                min={0}
                onChange={(value) =>
                  patch({ [`padding${side[0]!.toUpperCase()}${side.slice(1)}`]: value })
                }
              />
            ))
          ) : (
            <>
              <DesignNumberField
                compact
                label={ui("Horizontal padding", "Отступ по X")}
                prefix={<Columns2Icon className="size-3" />}
                value={sides.left}
                mixed={sides.left !== sides.right}
                min={0}
                onChange={(value) => patch({ paddingLeft: value, paddingRight: value })}
              />
              <DesignNumberField
                compact
                label={ui("Vertical padding", "Отступ по Y")}
                prefix={<Rows2Icon className="size-3" />}
                value={sides.top}
                mixed={sides.top !== sides.bottom}
                min={0}
                onChange={(value) => patch({ paddingTop: value, paddingBottom: value })}
              />
            </>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label={ui("Individual padding", "Свои отступы")}
                aria-pressed={individualPadding}
                onClick={() => setIndividualPadding(!individualPadding)}
              />
            }
          >
            <ScanIcon />
          </TooltipTrigger>
          <TooltipPopup>{ui("Individual padding", "Свои отступы")}</TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
}
