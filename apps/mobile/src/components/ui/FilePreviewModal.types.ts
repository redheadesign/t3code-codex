import type { AssetResource, EnvironmentId } from "@t3tools/contracts";

import type { FileBackedComposerAttachment } from "../../lib/composerImages";
import type { MediaActionsSource } from "../../lib/mediaActionsSource";

interface FilePreviewMetadata {
  readonly kind: "image" | "pdf" | "document";
  readonly mimeType?: string;
  readonly name?: string;
  readonly sourceIdentifier?: string;
  readonly srcFragment?: string;
  readonly actionsSource?: MediaActionsSource;
}

export type FilePreviewItem = FilePreviewMetadata &
  (
    | { readonly uri: string }
    | { readonly attachment: FileBackedComposerAttachment }
    | { readonly environmentId: EnvironmentId; readonly resource: AssetResource }
  );

export type FilePreviewSource = FilePreviewItem & {
  readonly gallery?: readonly FilePreviewItem[];
};

export interface ResolvedFilePreviewDocument extends FilePreviewMetadata {
  readonly kind: "pdf" | "document";
  readonly uri: string;
}

/** `uri` is absent while it resolves; `failed` marks one that never will. */
export interface FilePreviewImage extends FilePreviewMetadata {
  readonly uri?: string;
  readonly failed?: boolean;
}

/** Opens before every URL resolves; images keep their slot as URLs arrive. */
export interface FilePreviewImages {
  readonly kind: "image";
  readonly images: readonly FilePreviewImage[];
  readonly selectedIndex: number;
}

export type ResolvedFilePreviewSource = ResolvedFilePreviewDocument | FilePreviewImages;

export interface FilePreviewDictationProps {
  readonly dictationDraftKey?: string | null | undefined;
  readonly dictationLabel?: string | undefined;
}

export interface FilePreviewModalProps extends FilePreviewDictationProps {
  readonly source: FilePreviewSource | null;
  readonly onRequestClose: () => void;
  readonly onOpenError?: (error: unknown) => void;
}

/** A platform's viewer for one presentation, once FilePreviewSession has resolved it. */
export interface FilePreviewViewerProps extends FilePreviewDictationProps {
  readonly source: ResolvedFilePreviewSource;
  readonly onRequestClose: () => void;
  readonly onOpenError?: (error: unknown) => void;
}
