import { useUiText } from "~/i18n";
import { LinkIcon, UnlinkIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import type { DesignNode } from "./designDocument";

export function DesignAspectRatioControl({
  nodes,
  allNodes,
  onChange,
}: {
  nodes: readonly DesignNode[];
  allNodes: readonly DesignNode[];
  onChange: (locked: boolean) => void;
}) {
  const ui = useUiText();
  const byId = new Map(allNodes.map((node) => [node.nodeId, node]));
  const unavailable = nodes.some((node) => {
    const visited = new Set<string>();
    let parent = byId.get(node.parentId ?? "");
    while (parent && !visited.has(parent.nodeId)) {
      if (parent.kind === "instance") return true;
      visited.add(parent.nodeId);
      parent = byId.get(parent.parentId ?? "");
    }
    return false;
  });
  if (unavailable) return null;
  const locked = nodes.every((node) => node.aspectRatioLocked === true);
  const mixed = !locked && nodes.some((node) => node.aspectRatioLocked === true);
  const Icon = locked ? LinkIcon : UnlinkIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant={locked ? "secondary" : "ghost-muted"}
            aria-label={ui("Lock aspect ratio", "Фиксировать пропорции")}
            aria-pressed={mixed ? "mixed" : locked}
            onClick={() => onChange(!locked)}
          />
        }
      >
        <Icon className="rotate-90" />
      </TooltipTrigger>
      <TooltipPopup>
        {locked
          ? ui("Unlock aspect ratio", "Снять фиксацию")
          : ui("Lock aspect ratio", "Фиксировать пропорции")}
      </TooltipPopup>
    </Tooltip>
  );
}
