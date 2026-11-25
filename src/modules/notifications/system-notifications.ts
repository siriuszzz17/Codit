import { Capacitor } from "@capacitor/core";
import { isTauriDesktop } from "@/lib/desktop-updater";

export type SystemNotificationPermission =
  | "default"
  | "granted"
  | "denied"
  | "unsupported";

function isCapacitorAndroid(): boolean {
  return (
    typeof window !== "undefined" &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android"
  );
}

export function shouldPromptForNativeNotificationPermission(): boolean {
  return isTauriDesktop() || isCapacitorAndroid();
}

function normalizePermission(
  permission: string,
): SystemNotificationPermission {
  if (permission === "granted") {
    return "granted";
  }
  if (permission === "denied") {
    return "denied";
  }
  return "default";
}

export async function getSystemNotificationPermission(): Promise<SystemNotificationPermission> {
  try {
    if (isTauriDesktop()) {
      const { isPermissionGranted } = await import(
        "@tauri-apps/plugin-notification"
      );
      return (await isPermissionGranted()) ? "granted" : "default";
    }

    if (isCapacitorAndroid()) {
      const { LocalNotifications } = await import(
        "@capacitor/local-notifications"
      );
      const permission = await LocalNotifications.checkPermissions();
      return normalizePermission(permission.display);
    }

    if (typeof window !== "undefined" && "Notification" in window) {
      return normalizePermission(window.Notification.permission);
    }
  } catch {
    return "unsupported";
  }

  return "unsupported";
}

export async function requestSystemNotificationPermission(): Promise<SystemNotificationPermission> {
  try {
    if (isTauriDesktop()) {
      const { isPermissionGranted, requestPermission } = await import(
        "@tauri-apps/plugin-notification"
      );
      if (await isPermissionGranted()) {
        return "granted";
      }
      return normalizePermission(await requestPermission());
    }

    if (isCapacitorAndroid()) {
      const { LocalNotifications } = await import(
        "@capacitor/local-notifications"
      );
      const permission = await LocalNotifications.requestPermissions();
      return normalizePermission(permission.display);
    }

    if (typeof window !== "undefined" && "Notification" in window) {
      return normalizePermission(await window.Notification.requestPermission());
    }
  } catch {
    return "unsupported";
  }

  return "unsupported";
}

let lastLocalNotificationId = 0;

function nextLocalNotificationId(): number {
  const maxId = 2_147_483_647;
  const now = Date.now() % maxId;
  lastLocalNotificationId =
    Math.max(now, lastLocalNotificationId + 1) % maxId || 1;
  return lastLocalNotificationId;
}

export async function showSystemNotification(
  title: string,
  body: string | null,
  linkHref: string | null,
): Promise<void> {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    document.visibilityState === "visible"
  ) {
    return;
  }

  try {
    if (isTauriDesktop()) {
      const { isPermissionGranted, sendNotification } = await import(
        "@tauri-apps/plugin-notification"
      );
      if (!(await isPermissionGranted())) {
        return;
      }
      sendNotification({
        title,
        ...(body ? { body } : {}),
        ...(linkHref ? { extra: { linkHref } } : {}),
      });
      return;
    }

    if (isCapacitorAndroid()) {
      const { LocalNotifications } = await import(
        "@capacitor/local-notifications"
      );
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") {
        return;
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nextLocalNotificationId(),
            title,
            body: body ?? "",
            schedule: { at: new Date(Date.now() + 250) },
            smallIcon: "ic_stat_codit",
            iconColor: "#8B6BFF",
            ...(linkHref ? { extra: { linkHref } } : {}),
          },
        ],
      });
      return;
    }

    if (
      "Notification" in window &&
      window.Notification.permission === "granted"
    ) {
      const notification = new window.Notification(title, {
        body: body ?? undefined,
        icon: "/icons/icon-192x192.png",
      });
      notification.onclick = () => {
        window.focus();
        if (linkHref?.startsWith("/") && !linkHref.startsWith("//")) {
          window.location.assign(linkHref);
        }
        notification.close();
      };
    }
  } catch {
    // A native notification failure must not interrupt the in-app notification feed.
  }
}

export function isSafeNotificationHref(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
  );
}
