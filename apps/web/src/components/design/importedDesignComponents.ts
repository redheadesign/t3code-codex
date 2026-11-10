import type { DesignNode } from "./designDocument";

const MAX_COMPONENTS = 32;
const MAX_COMPONENT_LAYERS = 32;

function captureSignature(root: DesignNode, byId: ReadonlyMap<string, DesignNode>): string | null {
  const pending = [root];
  const layers: unknown[][] = [];
  let hasContent = false;
  while (pending.length > 0) {
    const layer = pending.pop()!;
    if (layers.length + pending.length + layer.childIds.length >= MAX_COMPONENT_LAYERS) return null;
    hasContent ||= layer.kind !== "group";
    layers.push([
      layer.kind,
      layer.childIds.length,
      layer === root ? null : Math.round(layer.x * 2),
      layer === root ? null : Math.round(layer.y * 2),
      Math.round(layer.width * 2),
      Math.round(layer.height * 2),
      layer.rotation,
      layer.flipX,
      layer.flipY,
      layer.clipContent,
      layer.opacity,
      layer.paint,
      layer.effects,
      layer.typography,
      layer.vector,
      layer.motion,
    ]);
    for (const childId of layer.childIds.toReversed()) {
      const child = byId.get(childId);
      if (!child) return null;
      pending.push(child);
    }
  }
  return hasContent ? JSON.stringify([root.name, layers]) : null;
}

export function collectReusableDesignComponents(
  nodes: readonly DesignNode[],
  frameId: string,
): readonly DesignNode[] {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const pending = [frameId];
  const collected = new Set<string>();
  const representatives = new Set<string>();
  while (pending.length > 0 && representatives.size < MAX_COMPONENTS) {
    const parent = byId.get(pending.pop()!);
    if (!parent) continue;
    const firstBySignature = new Map<string, string>();
    const matched = new Set<string>();
    for (const childId of parent.childIds) {
      const child = byId.get(childId);
      if (child?.kind !== "group" || child.childIds.length === 0) continue;
      const signature = captureSignature(child, byId);
      if (signature === null) continue;
      const first = firstBySignature.get(signature);
      if (first === undefined) {
        firstBySignature.set(signature, childId);
        continue;
      }
      matched.add(first);
      matched.add(childId);
      if (collected.has(signature)) continue;
      collected.add(signature);
      representatives.add(first);
      if (representatives.size === MAX_COMPONENTS) break;
    }
    // Prefer the repeated outer structure to nested fragments within its copies.
    for (const childId of parent.childIds.toReversed()) {
      if (!matched.has(childId)) pending.push(childId);
    }
  }
  if (representatives.size === 0) return nodes;
  return nodes.map((node) =>
    representatives.has(node.nodeId)
      ? { ...node, kind: "component", componentId: node.nodeId }
      : node,
  );
}
