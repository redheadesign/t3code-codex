import { createContext, useContext } from "react";
import { View } from "react-native";
import ImageViewing from "react-native-image-viewing";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMediaActions } from "../../state/mediaActions";
import { ImagePreviewDictationFooter } from "../ImagePreviewDictationFooter";
import { MediaPreviewHeader } from "../MediaPreviewHeader";
import type { FilePreviewDictationProps, FilePreviewImages } from "./FilePreviewModal.types";

type ImagePreviewProps = FilePreviewDictationProps & {
  readonly source: FilePreviewImages;
  readonly onRequestClose: () => void;
};

const ImagePreviewContext = createContext<ImagePreviewProps | null>(null);

function ImagePreviewHeader(header: { readonly imageIndex: number }) {
  const props = useContext(ImagePreviewContext)!;
  const source = props.source.images[header.imageIndex];
  const insets = useSafeAreaInsets();
  const mediaActions = useMediaActions(source?.actionsSource, props.onRequestClose);
  return (
    <View className="bg-black/70" style={{ paddingTop: insets.top }}>
      <MediaPreviewHeader
        title={source?.name ?? "Image"}
        media={mediaActions}
        closeAccessibilityLabel="Close image"
        onClose={props.onRequestClose}
      />
    </View>
  );
}

// Images still resolving show the viewer's loading page, and remount by key once their URL arrives.
function imageViewingProps(source: FilePreviewImages) {
  return {
    images: source.images.map((image) => (image.uri ? { uri: image.uri } : {})),
    keyExtractor: (_: unknown, index: number) => source.images[index]?.uri ?? `pending:${index}`,
    // Stays fixed: react-native-image-viewing remounts the Modal and replays its fade when it changes.
    imageIndex: source.selectedIndex,
  };
}

function ImagePreviewFooter() {
  const props = useContext(ImagePreviewContext)!;
  return props.dictationDraftKey ? (
    <ImagePreviewDictationFooter draftKey={props.dictationDraftKey} label={props.dictationLabel} />
  ) : null;
}

export function FilePreviewImageViewer(props: ImagePreviewProps) {
  const hasHeader = Boolean(props.source.images[props.source.selectedIndex]?.actionsSource);
  return (
    <ImagePreviewContext value={props}>
      <ImageViewing
        {...imageViewingProps(props.source)}
        visible
        onRequestClose={props.onRequestClose}
        swipeToCloseEnabled={false}
        doubleTapToZoomEnabled
        {...(hasHeader
          ? { presentationStyle: "fullScreen" as const, HeaderComponent: ImagePreviewHeader }
          : {})}
        {...(props.dictationDraftKey ? { FooterComponent: ImagePreviewFooter } : {})}
      />
    </ImagePreviewContext>
  );
}
