import * as Schema from "effect/Schema";
import { DESIGN_WIDGET_SOURCE_MIME } from "@t3tools/contracts";
import {
  contentAddressedDesignAssetId,
  readDesignAsset,
  saveDesignAsset,
} from "./designAssetStore";
import type { DesignAssetMeta } from "./designDocument";

export const DESIGN_WIDGET_SOURCE_LIMIT = 200_000;
const MAX_SOURCE_BYTES = 1024 * 1024;
const sourceField = Schema.String.check(Schema.isMaxLength(DESIGN_WIDGET_SOURCE_LIMIT));
const sourceSchema = Schema.Struct({
  html: sourceField,
  css: sourceField,
  js: sourceField,
});
export type DesignWidgetSource = typeof sourceSchema.Type;
const decodeSource = Schema.decodeUnknownSync(Schema.fromJsonString(sourceSchema));

export function designWidgetUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.href.length > 8192
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function parseDesignWidgetUrl(value: string): string | null {
  if (!value.trimStart().startsWith("<")) return designWidgetUrl(value);
  const template = document.createElement("template");
  template.innerHTML = value;
  const element = template.content.firstElementChild;
  if (template.content.childElementCount !== 1 || element?.localName !== "iframe") return null;
  return designWidgetUrl(element.getAttribute("src") ?? "");
}

export async function saveDesignWidgetSource(
  name: string,
  source: DesignWidgetSource,
): Promise<DesignAssetMeta> {
  const json = JSON.stringify(source);
  decodeSource(json);
  const file = new Blob([json], { type: DESIGN_WIDGET_SOURCE_MIME });
  if (file.size > MAX_SOURCE_BYTES) throw new Error("The widget source exceeds 1 MB.");
  const assetId = await contentAddressedDesignAssetId(file);
  await saveDesignAsset(assetId, file);
  return {
    assetId,
    name,
    mimeType: DESIGN_WIDGET_SOURCE_MIME,
    size: file.size,
    createdAt: new Date().toISOString(),
  };
}

export async function readDesignWidgetSource(assetId: string): Promise<DesignWidgetSource> {
  const file = await readDesignAsset(assetId);
  if (!file || file.type !== DESIGN_WIDGET_SOURCE_MIME || file.size > MAX_SOURCE_BYTES)
    throw new Error("The widget source is missing or invalid.");
  return decodeSource(await file.text());
}
