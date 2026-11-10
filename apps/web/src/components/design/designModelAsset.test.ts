// @effect-diagnostics nodeBuiltinImport:off - This unit test reads a bundled model fixture through its module URL.
import * as NodeFSP from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { DESIGN_MODEL_MAX_BYTES, parseDesignModel } from "./designModelAsset";

const triangle = {
  asset: { version: "2.0" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  buffers: [{ byteLength: 36 }],
  bufferViews: [{ buffer: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
};

function binaryModel(model: unknown) {
  const json = new TextEncoder().encode(JSON.stringify(model));
  const padded = Math.ceil(json.length / 4) * 4;
  const binary = new ArrayBuffer(28 + padded + 36);
  const view = new DataView(binary);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, binary.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  const chunk = new Uint8Array(binary, 20, padded);
  chunk.fill(0x20);
  chunk.set(json);
  view.setUint32(20 + padded, 36, true);
  view.setUint32(24 + padded, 0x004e4942, true);
  return binary;
}

it("recognizes binary models and reads a textured model already shipped by the app", async () => {
  const bytes = await NodeFSP.readFile(
    new URL("../device/models/iphone-18-pro.glb", import.meta.url),
  );
  expect(parseDesignModel(new Uint8Array(bytes).buffer)).toMatchObject({
    mimeType: "model/gltf-binary",
    resources: new Map(),
  });
  expect(parseDesignModel(binaryModel(triangle)).mimeType).toBe("model/gltf-binary");
});

it("keeps self-contained glTF resources local and rejects external GLB references", () => {
  const uri = `data:application/octet-stream;base64,${btoa("\0".repeat(36))}`;
  const model = { ...triangle, buffers: [{ byteLength: 36, uri }] };
  const parsed = parseDesignModel(new TextEncoder().encode(JSON.stringify(model)).buffer);
  expect(parsed.mimeType).toBe("model/gltf+json");
  expect(parsed.resources.get(uri)?.size).toBe(36);
  for (const external of [
    "geometry.bin",
    "https://example.org/geometry.bin",
    "blob:https://example.org/model",
  ]) {
    expect(() =>
      parseDesignModel(binaryModel({ ...model, buffers: [{ byteLength: 36, uri: external }] })),
    ).toThrow("external-resource");
  }
});

it("allows an empty meshopt fallback buffer only for bounded compressed buffer views", () => {
  const model = {
    ...triangle,
    extensionsRequired: ["EXT_meshopt_compression"],
    buffers: [
      triangle.buffers[0],
      { byteLength: 36, extensions: { EXT_meshopt_compression: { fallback: true } } },
    ],
    bufferViews: [
      {
        buffer: 1,
        byteLength: 36,
        extensions: {
          EXT_meshopt_compression: { buffer: 0, count: 3, byteStride: 12, byteLength: 36 },
        },
      },
    ],
  };
  expect(parseDesignModel(binaryModel(model)).mimeType).toBe("model/gltf-binary");
  expect(() =>
    parseDesignModel(binaryModel({ ...model, bufferViews: [{ buffer: 1, byteLength: 36 }] })),
  ).toThrow("invalid-model");
});

it("rejects oversized files, cyclic graphs, and out-of-bounds buffer views before loading", () => {
  expect(() => parseDesignModel(new ArrayBuffer(DESIGN_MODEL_MAX_BYTES + 1))).toThrow("too-large");
  expect(() => parseDesignModel(binaryModel({ ...triangle, nodes: [{ children: [0] }] }))).toThrow(
    "invalid-model",
  );
  expect(() =>
    parseDesignModel(binaryModel({ ...triangle, bufferViews: [{ buffer: 0, byteLength: 37 }] })),
  ).toThrow("invalid-model");
});
