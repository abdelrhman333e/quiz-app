const CACHE_NAME = "quiz-app-v24";
const APP_SHELL = [
  "/",
  "/tablet",
  "/screen",
  "/css/style.css?v=22",
  "/css/tablet.css?v=19",
  "/js/common.js?v=15",
  "/js/index.js?v=15",
  "/js/tablet.js?v=21",
  "/js/screen.js?v=21",
  "/js/pwa.js?v=15",
  "/js/sfx.js?v=15",
  "/js/theme.js?v=15",
  "/manifest.json",
  "/assets/icons/favicon.svg",
  "/assets/icons/favicon.png",
  "/assets/icons/icon-192-v2.png",
  "/assets/icons/icon-512-v2.png",
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
  // عشان أي تعديل في ملفات الواجهة يظهر من أول تحميل
  if (
    url.pathname.startsWith("/css/") ||
    url.pathname.startsWith("/js/") ||
    url.pathname.startsWith("/assets/icons/") ||
    url.pathname.startsWith("/assets/audio/") ||
    url.pathname === "/manifest.json"
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
