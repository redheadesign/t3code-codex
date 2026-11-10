import { createContext, useContext } from "react";

type UiText = (english: string, russian: string) => string;

export const uiTextByLanguage = {
  en: (value: string) => value,
  ru: (_: string, value: string) => value,
} satisfies Record<"en" | "ru", UiText>;

export const UiTextContext = createContext<UiText>(uiTextByLanguage.en);

export function useUiText(): UiText {
  return useContext(UiTextContext);
}
