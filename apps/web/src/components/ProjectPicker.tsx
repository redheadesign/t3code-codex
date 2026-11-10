import { useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";

import { DraftProjectName } from "./chat/DraftProjectName";
import { InlineButton } from "./ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
  useComboboxFilter,
} from "./ui/combobox";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

type ProjectPickerItem = {
  readonly value: string;
  readonly label: string;
  readonly searchText?: string | false;
};

export function ProjectPicker<Item extends ProjectPickerItem>({
  items,
  selectedValue,
  title,
  titleIcon,
  titleTooltip,
  ariaLabel,
  align = "start",
  open,
  onOpenChange,
  onSelect,
  renderIcon,
  renderTrailing,
  onHighlightedKeyDown,
  triggerRef,
}: {
  items: ReadonlyArray<Item>;
  selectedValue: string | undefined;
  title: string;
  titleIcon?: ReactNode;
  titleTooltip?: string | undefined;
  ariaLabel?: string;
  align?: "start" | "center";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect: (item: Item) => void;
  renderIcon: (item: Item) => ReactNode;
  renderTrailing?: ((item: Item) => ReactNode) | undefined;
  onHighlightedKeyDown?: (event: KeyboardEvent<HTMLInputElement>, item: Item) => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const [query, setQuery] = useState("");
  const highlighted = useRef<Item | null>(null);
  const filter = useComboboxFilter();
  const needle = query.trim();
  const filteredItems = needle
    ? items.filter(
        (item) =>
          item.searchText !== false &&
          filter.contains(item, needle, (candidate) => candidate.searchText || candidate.label),
      )
    : items;
  return (
    <Combobox
      items={items}
      filteredItems={filteredItems}
      autoHighlight
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={open}
      onOpenChange={(next) => {
        onOpenChange?.(next);
        setQuery("");
      }}
      onItemHighlighted={(item) => {
        highlighted.current = item ?? null;
      }}
      value={items.find((item) => item.value === selectedValue) ?? null}
      onValueChange={(item) => {
        if (item) onSelect(item);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <ComboboxTrigger
              render={<InlineButton tone="picker" />}
              ref={triggerRef}
              aria-label={ariaLabel}
              disabled={items.length === 0}
              className="pointer-events-auto min-w-0 max-w-full align-baseline"
            />
          }
        >
          <span className="flex min-w-0 items-baseline gap-1">
            {titleIcon ? (
              <span className="flex size-[1em] shrink-0 self-center">{titleIcon}</span>
            ) : null}
            <DraftProjectName value={title} singleLine />
          </span>
        </TooltipTrigger>
        {titleTooltip ? <TooltipPopup side="top">{titleTooltip}</TooltipPopup> : null}
      </Tooltip>
      <ComboboxPopup align={align} className="w-72 overflow-hidden">
        <ComboboxSearchInput
          aria-label="Search projects"
          placeholder="Search projects"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (highlighted.current) onHighlightedKeyDown?.(event, highlighted.current);
          }}
        />
        <ComboboxEmpty>No matching projects.</ComboboxEmpty>
        <ComboboxList>
          {(item: Item) => (
            <ComboboxItem key={item.value} value={item}>
              {renderIcon(item)}
              <Tooltip>
                <TooltipTrigger render={<span className="min-w-0 flex-1 text-sm" />}>
                  <DraftProjectName value={item.label} />
                </TooltipTrigger>
                <TooltipPopup side="top">{item.label}</TooltipPopup>
              </Tooltip>
              {renderTrailing?.(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
