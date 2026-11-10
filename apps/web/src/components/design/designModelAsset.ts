import { readImageDimensions } from "@t3tools/shared/imageDimensions";
import { contentAddressedDesignAssetId, saveDesignAsset } from "./designAssetStore";
import type { DesignAssetMeta } from "./designDocument";

export const DESIGN_MODEL_MAX_BYTES = 8 * 1024 * 1024;
export const DESIGN_MODEL_ACCEPT = ".glb,.gltf,model/gltf-binary,model/gltf+json";

export function isDesignModelMime(mimeType: string) {
  return mimeType === "model/gltf-binary" || mimeType === "model/gltf+json";
}

const GLB_MAGIC = 0x46546c67;
const GLB_JSON = 0x4e4f534a;
const GLB_BIN = 0x004e4942;
const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const MODEL_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/ktx2"]);
const MODEL_BUFFER_MIMES = new Set(["application/octet-stream", "application/gltf-buffer"]);

export class DesignModelAssetError extends Error {
  constructor(readonly reason: "too-large" | "external-resource" | "invalid-model") {
    super(reason);
  }
}

const invalid = () => new DesignModelAssetError("invalid-model");

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function items(value: unknown, max: number): readonly unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw invalid();
  return value;
}

function integer(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum)
    throw invalid();
  return value;
}

function decodeModelUri(value: unknown, types: ReadonlySet<string>) {
  const match = typeof value === "string" && /^data:([\w.+/-]+);base64,([\s\S]+)$/u.exec(value);
  if (!match || !types.has(match[1]!)) throw new DesignModelAssetError("external-resource");
  let binary: string;
  try {
    binary = atob(match[2]!);
  } catch {
    throw invalid();
  }
  return {
    mimeType: match[1]!,
    bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  };
}

function dimensions(bytes: Uint8Array, mimeType: string) {
  if (mimeType !== "image/ktx2") return readImageDimensions(bytes);
  if (bytes.length < 48 || KTX2_IDENTIFIER.some((byte, index) => bytes[index] !== byte))
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(28, true) !== 0 ||
    view.getUint32(32, true) > 1 ||
    view.getUint32(36, true) !== 1
  )
    return null;
  return { width: view.getUint32(20, true), height: view.getUint32(24, true) };
}

function validateNodes(value: unknown) {
  const nodes = items(value, 4096).map(object);
  const children = nodes.map((node) =>
    items(node.children, 4096).map((index) => integer(index, nodes.length - 1)),
  );
  const parents = new Set<number>();
  for (const branch of children) {
    for (const index of branch) {
      if (parents.has(index)) throw invalid();
      parents.add(index);
    }
  }
  const visited = new Set<number>();
  const visit = (index: number, depth: number) => {
    if (depth > 128 || visited.has(index)) throw invalid();
    visited.add(index);
    for (const child of children[index]!) visit(child, depth + 1);
  };
  for (const index of nodes.keys()) if (!parents.has(index)) visit(index, 0);
  if (visited.size !== nodes.length) throw invalid();
  return nodes.length;
}

export function parseDesignModel(data: ArrayBuffer) {
  if (data.byteLength > DESIGN_MODEL_MAX_BYTES) throw new DesignModelAssetError("too-large");
  if (data.byteLength < 4) throw invalid();
  const view = new DataView(data);
  const binary = view.getUint32(0, true) === GLB_MAGIC;
  let jsonBytes = new Uint8Array(data);
  let binaryBytes: Uint8Array | undefined;
  if (binary) {
    if (
      data.byteLength < 20 ||
      view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== data.byteLength
    )
      throw invalid();
    const jsonSize = view.getUint32(12, true);
    if (
      jsonSize % 4 !== 0 ||
      view.getUint32(16, true) !== GLB_JSON ||
      jsonSize > data.byteLength - 20
    )
      throw invalid();
    jsonBytes = new Uint8Array(data, 20, jsonSize);
    for (let offset = 20 + jsonSize; offset < data.byteLength;) {
      if (offset + 8 > data.byteLength) throw invalid();
      const chunkLength = view.getUint32(offset, true);
      if (chunkLength % 4 !== 0 || chunkLength > data.byteLength - offset - 8) throw invalid();
      if (view.getUint32(offset + 4, true) === GLB_BIN) {
        if (binaryBytes) throw invalid();
        binaryBytes = new Uint8Array(data, offset + 8, chunkLength);
      }
      offset += 8 + chunkLength;
    }
  }

  let json: string;
  let model: Record<string, unknown>;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes);
    model = object(JSON.parse(json));
  } catch {
    throw invalid();
  }
  if (object(model.asset).version !== "2.0") throw invalid();
  const nodeCount = validateNodes(model.nodes);
  const scenes = items(model.scenes, 16).map(object);
  if (scenes.length === 0 || nodeCount === 0) throw invalid();
  if (model.scene !== undefined) integer(model.scene, scenes.length - 1);
  for (const scene of scenes) {
    const roots = items(scene.nodes, 4096).map((value) => integer(value, nodeCount - 1));
    if (new Set(roots).size !== roots.length) throw invalid();
  }

  const resources = new Map<string, Blob>();
  const resource = (uri: unknown, types: ReadonlySet<string>) => {
    const decoded = decodeModelUri(uri, types);
    resources.set(uri as string, new Blob([decoded.bytes], { type: decoded.mimeType }));
    return decoded;
  };
  const buffers = items(model.buffers, 16).map((value, index) => {
    const buffer = object(value);
    const compression =
      buffer.extensions === undefined
        ? undefined
        : object(buffer.extensions).EXT_meshopt_compression;
    if (
      buffer.uri === undefined &&
      compression !== undefined &&
      object(compression).fallback === true
    ) {
      integer(buffer.byteLength, 32 * 1024 * 1024);
      return null;
    }
    const bytes =
      buffer.uri === undefined && index === 0 && binaryBytes
        ? binaryBytes
        : resource(buffer.uri, MODEL_BUFFER_MIMES).bytes;
    return bytes.subarray(0, integer(buffer.byteLength, bytes.length));
  });
  const views = items(model.bufferViews, 8192).map((value) => {
    const source = object(value);
    const extensions = source.extensions === undefined ? undefined : object(source.extensions);
    const compressed = extensions?.EXT_meshopt_compression;
    if (compressed !== undefined) {
      const codec = object(compressed);
      const decodedSize = integer(codec.count, 4_000_000) * integer(codec.byteStride, 256);
      if (decodedSize !== source.byteLength || decodedSize > 32 * 1024 * 1024) throw invalid();
      const buffer = buffers[integer(codec.buffer, buffers.length - 1)];
      if (!buffer) throw invalid();
      const offset = integer(codec.byteOffset ?? 0, buffer.length);
      integer(codec.byteLength, buffer.length - offset);
      return null;
    }
    const buffer = buffers[integer(source.buffer, buffers.length - 1)];
    if (!buffer) throw invalid();
    const offset = integer(source.byteOffset ?? 0, buffer.length);
    const length = integer(source.byteLength, buffer.length - offset);
    return buffer.subarray(offset, offset + length);
  });
  let texturePixels = 0;
  for (const value of items(model.images, 64)) {
    const image = object(value);
    const embedded =
      image.uri === undefined
        ? { bytes: views[integer(image.bufferView, views.length - 1)], mimeType: image.mimeType }
        : resource(image.uri, MODEL_IMAGE_MIMES);
    if (
      !embedded.bytes ||
      typeof embedded.mimeType !== "string" ||
      !MODEL_IMAGE_MIMES.has(embedded.mimeType)
    )
      throw invalid();
    const size = dimensions(embedded.bytes, embedded.mimeType);
    if (!size || size.width < 1 || size.height < 1 || size.width > 4096 || size.height > 4096)
      throw invalid();
    texturePixels += size.width * size.height;
    if (texturePixels > 32 * 1024 * 1024) throw invalid();
  }
  let accessorElements = 0;
  for (const value of items(model.accessors, 8192)) {
    const accessor = object(value);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }[
      accessor.type as "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT2" | "MAT3" | "MAT4"
    ];
    if (!width) throw invalid();
    accessorElements += integer(accessor.count, 4_000_000) * width;
    if (accessorElements > 16_000_000) throw invalid();
  }
  return {
    source: binary ? data : json,
    mimeType: binary ? "model/gltf-binary" : "model/gltf+json",
    resources,
  };
}

export async function prepareDesignModelAsset(file: Blob, name: string): Promise<DesignAssetMeta> {
  if (file.size > DESIGN_MODEL_MAX_BYTES) throw new DesignModelAssetError("too-large");
  const bytes = await file.arrayBuffer();
  const { mimeType } = parseDesignModel(bytes);
  const asset = new Blob([bytes], { type: mimeType });
  const assetId = await contentAddressedDesignAssetId(asset);
  await saveDesignAsset(assetId, asset);
  return { assetId, name, mimeType, size: asset.size, createdAt: new Date().toISOString() };
}
