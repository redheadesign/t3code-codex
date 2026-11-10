import { useUiText } from "~/i18n";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";

import {
  hasDesktopNotifications,
  hasNotificationSound,
  NOTIFICATION_MODE_LABELS,
  unlockNotificationAudio,
} from "../../threadNotifications";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

export function NotificationSettings() {
  const ui = useUiText();
  const modeLabels = {
    off: ui("Off", "Выкл."),
    notifications: ui(NOTIFICATION_MODE_LABELS.notifications, "Без звука"),
    sound: ui(NOTIFICATION_MODE_LABELS.sound, "Только звук"),
    "notifications-and-sound": ui(NOTIFICATION_MODE_LABELS["notifications-and-sound"], "Со звуком"),
  };
  const mode = useScopedSettings((settings) => settings.notificationMode);
  const updateSettings = useUpdateScopedSettings();
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  return (
    <SettingsRow
      {...searchableSetting("thread-notifications")}
      description={
        permissionMessage ??
        ui(
          "System alerts when a thread finishes, fails, or needs input or approval. Applies to this device while T3 Code is open.",
          "Уведомления о результате, ошибке или запросе ответа, пока T3 Code открыт.",
        )
      }
      control={
        <Select
          value={mode}
          disabled={requesting}
          onValueChange={async (value) => {
            if (
              value !== "off" &&
              value !== "notifications" &&
              value !== "sound" &&
              value !== "notifications-and-sound"
            )
              return;
            setPermissionMessage(null);
            if (hasNotificationSound(value)) unlockNotificationAudio();
            if (hasDesktopNotifications(value)) {
              if (typeof Notification === "undefined" || !window.isSecureContext) {
                setPermissionMessage(
                  ui(
                    "Notifications need a supported browser over HTTPS, or the desktop app. Sound only is still available.",
                    "Для уведомлений откройте приложение или сайт по HTTPS. Звук доступен и здесь.",
                  ),
                );
                return;
              }
              setRequesting(true);
              const permission = await settlePromise(() => Notification.requestPermission());
              setRequesting(false);
              if (permission._tag === "Failure") {
                setPermissionMessage(
                  ui(
                    "Notifications are unavailable in this browser. Sound only is still available.",
                    "Браузер не поддерживает уведомления. Можно оставить звук.",
                  ),
                );
                return;
              }
              if (permission.value !== "granted") {
                setPermissionMessage(
                  ui(
                    "Allow notifications in your browser or system settings, then choose this option again. Sound only is still available.",
                    "Разрешите уведомления в браузере или системе и выберите этот режим снова.",
                  ),
                );
                return;
              }
            }
            updateSettings({ notificationMode: value });
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-56"
            aria-label={ui("Thread notifications", "Системные")}
          >
            <SelectValue>{modeLabels[mode]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {Object.entries(modeLabels).map(([value, label]) => (
              <SelectItem key={value} hideIndicator value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}
