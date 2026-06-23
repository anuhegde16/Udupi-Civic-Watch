import { useState, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

function subscriptionToJson(sub: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };
}

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function useCitizenPushNotifications() {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [permission, setPermission] = useState<PushPermission>(() => {
    if (!supported) return "unsupported";
    return Notification.permission as PushPermission;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const subscribe = useCallback(
    async (reportId?: number): Promise<boolean> => {
      if (!supported) return false;

      setIsLoading(true);
      try {
        const perm = await Notification.requestPermission();
        setPermission(perm as PushPermission);
        if (perm !== "granted") return false;

        const { publicKey } = await customFetch<{ publicKey: string }>(
          "/api/notifications/vapid-public-key"
        );
        const reg = await navigator.serviceWorker.ready;
        const keyArray = urlB64ToUint8Array(publicKey);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyArray.buffer.slice(
            keyArray.byteOffset,
            keyArray.byteOffset + keyArray.byteLength
          ) as ArrayBuffer,
        });

        if (reportId) {
          await customFetch("/api/notifications/anonymous-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...subscriptionToJson(sub), reportId }),
          });
        }

        setIsSubscribed(true);
        return true;
      } catch (err) {
        console.error("Citizen push subscription failed:", err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [supported]
  );

  return { permission, isSubscribed, isLoading, supported, subscribe };
}
