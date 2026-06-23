/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(
    new NetworkFirst({ cacheName: "pages" }),
    { denylist: [/^\/api\//] }
  )
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "api-cache",
    networkTimeoutSeconds: 5,
    plugins: [{ cacheWillUpdate: async ({ response }) => (response.status === 200 ? response : null) }],
  })
);

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: { title: string; body: string; type?: string; reportId?: number; url?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Udupi Civic Watch", body: event.data.text() };
  }

  const options: NotificationOptions = {
    body: payload.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.reportId ? `report-${payload.reportId}` : payload.type ?? "notification",
    data: { url: payload.url ?? "/", reportId: payload.reportId, type: payload.type },
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options).then(() => {
      // Signal all focused page clients to play the notification sound
      return self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: "push-received", payload });
          }
        });
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const data = event.notification.data as { url?: string };
  const targetUrl = data?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          return existing.navigate(targetUrl);
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

self.addEventListener("pushsubscriptionchange", (event: Event) => {
  const e = event as PushSubscriptionChangeEvent;
  if (e.newSubscription) {
    e.waitUntil(
      fetch("/api/notifications/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: e.newSubscription.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(e.newSubscription.getKey("p256dh")!))),
            auth: btoa(String.fromCharCode(...new Uint8Array(e.newSubscription.getKey("auth")!))),
          },
        }),
        credentials: "include",
      })
    );
  }
});

interface PushSubscriptionChangeEvent extends Event {
  newSubscription: PushSubscription | null;
  oldSubscription: PushSubscription | null;
  waitUntil(promise: Promise<any>): void;
}
