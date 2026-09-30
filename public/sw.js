// Service worker for push notifications (portfolio alerts).
// Registered by app/components/NotificationToggle.tsx.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(msg.title || 'Portfolio alert', {
    body: msg.body || '',
    tag: msg.tag,
    icon: '/icon.png',
    badge: '/icon.png',
    data: { url: msg.url || '/' },
  }));
});

// Tapping a notification focuses the open app, or opens it.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(url);
  }));
});
