import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { useUiText } from "~/i18n";
import { SETTINGS_SECTION_LABELS, settingsSectionLabel, type SettingsPath } from "./settingsSearch";

export function SettingsBreadcrumb({ pathname }: { pathname: string }) {
  const text = useUiText();
  const path = pathname.replace(/\/+$/, "");
  const sectionLabel = Object.hasOwn(SETTINGS_SECTION_LABELS, path)
    ? settingsSectionLabel(path as SettingsPath, text)
    : path === "/settings/open-source-licenses"
      ? text("Open source licenses", "Лицензии")
      : null;

  return (
    <WorkspaceBreadcrumb ariaLabel="Settings breadcrumb">
      {sectionLabel ? (
        <>
          <WorkspaceBreadcrumbItem>{text("Settings", "Настройки")}</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
        </>
      ) : null}
      <WorkspaceBreadcrumbItem current className="truncate">
        {sectionLabel ?? text("Settings", "Настройки")}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}
