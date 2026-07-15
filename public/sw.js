self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { title: "Service Desk", body: event.data ? event.data.text() : "Нове сповіщення" };
  }

  const title = payload.title || "Service Desk";
  const options = {
    body: payload.body || "Нове сповіщення",
    icon: payload.icon || "/icons/icon-192.jpg",
    badge: payload.badge || "/icons/icon-192.jpg",
    data: { url: payload.url || "/ai-tickets" },
    tag: payload.tag || "ai-ticket",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : "/ai-tickets";
  const url = new URL(targetUrl, self.location.origin).href;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windowClients) {
      if (client.url === url && "focus" in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
