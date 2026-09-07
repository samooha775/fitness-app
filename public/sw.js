// Service worker: handles real push notifications (delivered by the server's
// scheduler even when the app/tab is closed) and lets the page trigger local
// notifications instantly for things like achievement unlocks.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: '💪 Push-Up Reminder', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || '💪 Push-Up Reminder';
  const options = {
    body: data.body || "Time to get some reps in!",
    icon: data.icon || '/icons/icon.svg',
    badge: data.badge || '/icons/badge.svg',
    vibrate: [100, 50, 100],
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});

// Allows the page to ask the service worker to fire a local notification
// (used for instant achievement-unlock toasts, no server round trip needed).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'LOCAL_NOTIFY') {
    const { title, body, icon, badge } = event.data.payload || {};
    self.registration.showNotification(title || '💪 Push Forge', {
      body: body || '',
      icon: icon || '/icons/icon.svg',
      badge: badge || '/icons/badge.svg',
      vibrate: [80, 40, 80],
    });
  }
});
