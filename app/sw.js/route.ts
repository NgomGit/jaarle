// Service worker de la PWA Jaarle, servi à la racine (/sw.js) pour couvrir tout le site.
//
// Règle d'or pour les mises à jour : on ne met JAMAIS en cache les pages HTML ni les données
// (Supabase, server actions, requêtes RSC). Après un déploiement, la page suivante vient donc
// toujours du serveur, avec le nouveau code. Seuls sont gardés :
// • /_next/static/* (fichiers dont le nom change à chaque version → aucun risque de périmé),
//   en partage entre versions pour qu'un onglet resté ouvert retrouve ses anciens fichiers ;
// • images / polices de /public (rafraîchies en arrière-plan) ;
// • la page /offline (et ses fichiers), affichée quand il n'y a pas de réseau.
// La version change à chaque build : le navigateur voit un nouveau fichier, l'installe et
// l'active tout de suite (skipWaiting), sans attendre que le vendeur ferme l'app.

export const dynamic = "force-static";

const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.VERCEL_DEPLOYMENT_ID || `build-${Date.now()}`;

const SW_SOURCE = String.raw`
const VERSION = ${JSON.stringify(VERSION)};
const SHELL_CACHE = "jaarle-shell-" + VERSION;
const STATIC_CACHE = "jaarle-next-static";
const ASSET_CACHE = "jaarle-assets";
const OFFLINE_URL = "/offline";
const SHELL_URLS = [OFFLINE_URL, "/images/icon-192.png", "/images/icon-512.png", "/images/logo-icon-96.png", "/images/notification-badge.png"];
const STATIC_MAX = 400;
const ASSET_MAX = 120;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_URLS);
    // Les fichiers JS/CSS de la page hors connexion, pour qu'elle s'affiche correctement sans réseau.
    try {
      const html = await (await fetch(OFFLINE_URL, { cache: "no-store" })).text();
      const files = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) || [])];
      const statics = await caches.open(STATIC_CACHE);
      await Promise.all(files.map((f) => statics.add(f).catch(() => undefined)));
    } catch (e) { /* la page s'affichera sans style, ce n'est pas bloquant */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("jaarle-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function pageFromNetwork(event) {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;
    return await fetch(event.request);
  } catch (e) {
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response("Pas de connexion", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, res.clone());
    trim(STATIC_CACHE, STATIC_MAX);
  }
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(ASSET_CACHE);
  // Le cache des assets, sinon celui de l'installation (icônes de la page hors connexion).
  const cached = (await cache.match(event.request)) || (await caches.match(event.request));
  const network = fetch(event.request).then((res) => {
    if (res.ok && res.type === "basic") cache.put(event.request, res.clone()).then(() => trim(ASSET_CACHE, ASSET_MAX));
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  return network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, images des boutiques, paiement : direct

  if (request.mode === "navigate") {
    event.respondWith(pageFromNetwork(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (/^\/(images|fonts)\//.test(url.pathname) || url.pathname === "/icon.png" || url.pathname === "/apple-icon.png" || url.pathname === "/favicon.ico") {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  // Tout le reste (données, RSC, API, /affiche/…) : réseau, sans passer par le cache.
});

// ── Notifications push (migration 0033) ──────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Jaarle";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/images/icon-192.png",
    badge: "/images/notification-badge.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    lang: "fr",
    data: { url: data.url || "/dashboard" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/dashboard", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // L'app est déjà ouverte : on la ramène au premier plan sur la bonne page.
    for (const client of all) {
      if (new URL(client.url).origin === target.origin && "focus" in client) {
        await client.focus();
        if ("navigate" in client) { try { await client.navigate(target.href); } catch (e) { /* page non contrôlée */ } }
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});

// Le navigateur a renouvelé l'abonnement : la page le réenregistrera à la prochaine ouverture.
self.addEventListener("pushsubscriptionchange", () => {});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "GET_VERSION" && event.ports[0]) event.ports[0].postMessage(VERSION);
});
`;

export function GET() {
  return new Response(SW_SOURCE, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
