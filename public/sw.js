const STATIC_CACHE = "codit-static-v1";
const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/octopy-mark.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("codit-") && name !== STATIC_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function handleNavigationRequest(request) {
  try {
    return await fetch(request);
  } catch {
    const cachedOffline = await caches.match("/offline");
    if (cachedOffline) {
      return cachedOffline;
    }

    return new Response(
      "Você está sem conexão com a internet no momento. Reconecte-se para continuar no Codit.",
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  const cacheControl = (response.headers.get("Cache-Control") || "").toLowerCase();
  const isCacheable =
    response.ok &&
    response.type === "basic" &&
    !cacheControl.includes("no-store") &&
    !cacheControl.includes("private");

  if (isCacheable) {
    await cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Nunca cachear endpoints de API ou dados dinâmicos no Service Worker compartilhado.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  const isPublicStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest";

  if (isPublicStaticAsset) {
    event.respondWith(handleStaticAsset(request));
  }
});
