const CACHE_NAME = "quiz-app-v5";
const APP_SHELL = [
  "/",
  "/tablet",
  "/screen",
  "/style.css",
  "/common.js",
  "/pwa.js",
  "/sfx.js",
  "/manifest.json",
  "/favicon.svg",
  "/favicon.png",
  "/icon-192-v2.png",
  "/icon-512-v2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("quiz-app-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function shellKey(path) {
  if (path === "/") return "/";
  if (path === "/tablet") return "/tablet";
  if (path.startsWith("/screen")) return "/screen";
  return null;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/audio/"))
    return;

  // الصفحات: الشبكة أولاً، والكاش للعمل بدون إنترنت فقط
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          const key = shellKey(url.pathname);
          if (key && response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(key, copy);
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(shellKey(url.pathname) || "/")) ||
            Response.error()
          );
        }),
    );
    return;
  }

  // الملفات الثابتة: الشبكة أولاً (مع إعادة تحقق) بدل الكاش أولاً،
  // عشان أي تعديل في style.css أو الجافاسكريبت يظهر من أول تحميل
  if (
    url.pathname === "/style.css" ||
    url.pathname === "/common.js" ||
    url.pathname === "/pwa.js" ||
    url.pathname === "/sfx.js" ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/favicon.png" ||
    /^\/icon-(192|512)(-v2)?\.png$/.test(url.pathname)
  ) {
    event.respondWith(
      fetch(request, { cache: "no-cache" })
        .then(async (response) => {
          if (response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, copy);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: true });
          return cached || Response.error();
        }),
    );
  }
});
