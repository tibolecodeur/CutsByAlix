/*
 * Service worker de l'espace admin (portée /admin, ADR 0012) : UNIQUEMENT les notifications
 * push. Aucun cache, aucun mode hors ligne : il n'intercepte aucune requête (pas d'écouteur
 * « fetch »), le site se charge exactement comme sans lui.
 *
 * Le message reçu (déjà déchiffré par le navigateur) est un JSON { title, body, url, tag }
 * construit par l'Edge Function notify-booking.
 */

self.addEventListener("install", () => {
  // La nouvelle version prend la main tout de suite (rien à mettre en cache).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Seules les adresses de l'espace admin sont ouvertes au toucher (jamais un autre site). */
function adminUrl(value) {
  try {
    const url = new URL(value, self.location.origin);
    const inAdmin = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
    if (url.origin === self.location.origin && inAdmin) return url.href;
  } catch {
    // Adresse illisible : on retombe sur l'accueil de l'admin.
  }
  return new URL("/admin", self.location.origin).href;
}

self.addEventListener("push", (event) => {
  let data;
  try {
    data = (event.data && event.data.json()) || {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title : "CutsByAlix";
  // Safari exige qu'un push affiche TOUJOURS une notification (sinon il retire l'abonnement).
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: "/admin-icon-192.png",
      badge: "/admin-icon-192.png",
      data: { url: adminUrl(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = adminUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // L'admin est déjà ouvert : on le ramène au premier plan sur la bonne page. (Un onglet de
      // la vitrine n'est pas sous le contrôle du service worker : on ouvre alors l'admin.)
      for (const client of windows) {
        const url = new URL(client.url);
        const inAdmin = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
        if (url.origin === self.location.origin && inAdmin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
