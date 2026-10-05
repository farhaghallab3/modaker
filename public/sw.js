/* مُدّكِر — service worker for Web Push reminders.
 * Payload (see src/server/notifications/channel.ts PushPayload):
 *   { id, kind, title, body, href }
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "مُدّكِر";
  const options = {
    body: data.body || "حان وقت وردك اليومي 🌿",
    dir: "rtl",
    lang: "ar",
    icon: "/brand/icon-192.png",
    badge: "/brand/badge-72.png",
    tag: data.kind || "muzakkir", // one visible reminder per kind
    renotify: false,
    data: { href: data.href || "/", id: data.id },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  // Only ever navigate within our own origin.
  const url = new URL(href, self.location.origin);
  const target = url.origin === self.location.origin ? url.href : self.location.origin + "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) return client.navigate(target);
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
