import * as Schema from "effect/Schema";
import { NonNegativeInt } from "./baseSchemas.ts";

const DesignMotionEasing = Schema.String.check(Schema.isMaxLength(160));
const DesignMotionKeyframe = Schema.Struct({
  offset: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  easing: Schema.optional(DesignMotionEasing),
  opacity: Schema.optional(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  translation: Schema.optional(
    Schema.Tuple([
      Schema.Number.check(Schema.isBetween({ minimum: -32768, maximum: 32768 })),
      Schema.Number.check(Schema.isBetween({ minimum: -32768, maximum: 32768 })),
    ]),
  ),
  rotation: Schema.optional(
    Schema.Number.check(Schema.isBetween({ minimum: -3600, maximum: 3600 })),
  ),
  scale: Schema.optional(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 64 }))),
});

/** Time-based visual motion. Translation and rotation are relative to the captured layer pose. */
export const DesignMotion = Schema.Struct({
  keyframes: Schema.Array(DesignMotionKeyframe).check(
    Schema.isMinLength(2),
    Schema.isMaxLength(32),
  ),
  durationMs: Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 120_000 })),
  delayMs: Schema.Number.check(Schema.isBetween({ minimum: -120_000, maximum: 120_000 })),
  iterations: Schema.Union([
    Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
    Schema.Literal("infinite"),
  ]),
  direction: Schema.Literals(["normal", "reverse", "alternate", "alternate-reverse"]),
  fill: Schema.Literals(["none", "forwards", "backwards", "both", "auto"]),
  easing: DesignMotionEasing,
});
export type DesignMotion = typeof DesignMotion.Type;

export class DesignPackageMalformedError extends Schema.TaggedError<DesignPackageMalformedError>()(
  "DesignPackageMalformedError",
  {
    cwd: Schema.String,
    relativePath: Schema.String,
    message: Schema.String,
  },
) {}

export const DesignAssetPayload = Schema.Struct({
  assetId: Schema.String,
  mimeType: Schema.String,
  base64: Schema.String.check(Schema.isMaxLength(12_000_000)),
});
export type DesignAssetPayload = typeof DesignAssetPayload.Type;

export const DESIGN_WIDGET_SOURCE_MIME = "application/vnd.t3code.design-widget+json";

/** Portable operation envelope for Design document sync. Payload stays JSON so the server never executes canvas code. */
export const DesignSyncOperation = Schema.Struct({
  operationId: Schema.String,
  baseRevision: NonNegativeInt,
  kind: Schema.Literals(["update-node", "add-node", "add-page", "add-asset"]),
  nodeId: Schema.NullOr(Schema.String),
  assetId: Schema.optional(Schema.String),
  fields: Schema.optional(Schema.Array(Schema.String)),
  payload: Schema.Unknown,
});
export type DesignSyncOperation = typeof DesignSyncOperation.Type;

export const DesignSyncRequest = Schema.Struct({
  documentId: Schema.String,
  baseRevision: NonNegativeInt,
  operations: Schema.Array(DesignSyncOperation),
  assetIds: Schema.Array(Schema.String),
  assetPayloads: Schema.optional(Schema.Array(DesignAssetPayload)),
  /** Serialized dependency-free Design IR for remote clients and future migrations. */
  snapshot: Schema.optional(Schema.String),
});
export type DesignSyncRequest = typeof DesignSyncRequest.Type;

export const DesignConflict = Schema.Struct({
  nodeId: Schema.NullOr(Schema.String),
  assetId: Schema.optional(Schema.String),
  baseRevision: NonNegativeInt,
  serverRevision: NonNegativeInt,
  localValue: Schema.Unknown,
  serverValue: Schema.Unknown,
});
export type DesignConflict = typeof DesignConflict.Type;

export const DesignSyncResult = Schema.Union([
  Schema.TaggedStruct("accepted", {
    documentId: Schema.String,
    revision: NonNegativeInt,
    acceptedOperationIds: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("conflict", {
    documentId: Schema.String,
    revision: NonNegativeInt,
    conflicts: Schema.Array(DesignConflict),
  }),
]);
export type DesignSyncResult = typeof DesignSyncResult.Type;

export const DesignReadInput = Schema.Struct({
  cwd: Schema.String,
  relativePath: Schema.String,
});
export type DesignReadInput = typeof DesignReadInput.Type;

export const DesignReadResult = Schema.Struct({
  found: Schema.Boolean,
  contents: Schema.NullOr(Schema.String),
});
export type DesignReadResult = typeof DesignReadResult.Type;

export const DesignSyncInput = Schema.Struct({
  cwd: Schema.String,
  relativePath: Schema.String,
  request: DesignSyncRequest,
});
export type DesignSyncInput = typeof DesignSyncInput.Type;

export const DesignServerStateSnapshot = Schema.Struct({
  documentId: Schema.String,
  revision: NonNegativeInt,
  nodes: Schema.Record(Schema.String, Schema.Unknown),
  assetIds: Schema.Array(Schema.String),
  assetPayloads: Schema.optional(Schema.Array(DesignAssetPayload)),
  snapshot: Schema.optional(Schema.String),
});
export type DesignServerStateSnapshot = typeof DesignServerStateSnapshot.Type;
