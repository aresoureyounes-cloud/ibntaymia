/* IDAROOM Service Worker — cache-last-page offline fallback.
 * Strategy:
 *  - Navigations: network-first. On success, cache the response so it can be
 *    served later when offline. On failure, serve the most recently cached
 *    navigation for this URL, then any cached navigation, then a small inline
 *    offline shell explaining that the content is temporary.
 *  - Static assets (script/style/image/font): stale-while-revalidate.
 *  - Everything else (API/RPC/POST): passthrough — never cached.
 */

const VERSION = "v1";
const NAV_CACHE = `idaroom-nav-${VERSION}`;
const ASSET_CACHE = `idaroom-assets-${VERSION}`;
const LAST_NAV_URL = "/__idaroom_last_nav__";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== NAV_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>إداروم — وضع عدم الاتصال</title>
<style>
  :root{color-scheme:light dark}
  html,body{height:100%;margin:0;background:#0f1a14;color:#f4efe6;font-family:system-ui,-apple-system,"Segoe UI",Tajawal,sans-serif}
  .wrap{min-height:100%;display:grid;place-items:center;padding:2rem;text-align:center}
  .card{max-width:520px;padding:2rem;border-radius:20px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
  h1{margin:0 0 .5rem;font-size:1.5rem}
  p{margin:.5rem 0;opacity:.85;line-height:1.7}
  button{margin-top:1.25rem;padding:.7rem 1.4rem;border-radius:12px;border:0;background:#e08c3a;color:#1b120a;font-weight:700;cursor:pointer}
  .dot{display:inline-block;width:8px;height:8px;border-radius:99px;background:#ef4444;margin-inline-end:6px;vertical-align:middle}
</style></head>
<body><div class="wrap"><div class="card">
<div><span class="dot"></span> <strong>غير متصل</strong></div>
<h1>لا يوجد اتصال بالإنترنت</h1>
<p>لم يتم حفظ نسخة من هذه الصفحة بعد. افتح صفحة سبق تحميلها لعرضها من الذاكرة المؤقتة.</p>
<button onclick="location.reload()">إعادة المحاولة</button>
</div></div></body></html>`;

async function networkFirstNav(request) {
  const cache = await caches.open(NAV_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone()).catch(() => {});
      // Track last successful navigation URL as an ordinary cached response.
      cache
        .put(
          LAST_NAV_URL,
          new Response(request.url, { headers: { "content-type": "text/plain" } }),
        )
        .catch(() => {});
    }
    return fresh;
  } catch {
    const exact = await cache.match(request);
    if (exact) return withOfflineBanner(exact, "exact");
    // Try last-loaded navigation
    const lastRef = await cache.match(LAST_NAV_URL);
    if (lastRef) {
      const lastUrl = await lastRef.text();
      const last = await cache.match(lastUrl);
      if (last) return withOfflineBanner(last, "last");
    }
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

async function withOfflineBanner(response, mode) {
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return response;
  try {
    const html = await response.text();
    const banner = `<div id="idaroom-offline-banner" dir="rtl" style="position:fixed;inset-inline:0;top:0;z-index:2147483647;background:#b45309;color:#fff;padding:8px 14px;font:600 13px/1.4 system-ui,Tajawal,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.25)">أنت غير متصل — تُعرض ${mode === "exact" ? "نسخة مخبأة من هذه الصفحة" : "آخر صفحة تم تحميلها"}. المحتوى مؤقت وقد لا يكون محدّثاً.</div>`;
    const injected = html.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
    return new Response(injected, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return response;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Skip cross-origin (Supabase, connectors, CDN APIs)
  if (url.origin !== self.location.origin) return;
  // Skip API / server-fn / auth callbacks
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn/") ||
    url.pathname.startsWith("/__server/") ||
    url.pathname.startsWith("/auth/")
  )
    return;

  if (req.mode === "navigate" || (req.destination === "" && req.headers.get("accept")?.includes("text/html"))) {
    event.respondWith(networkFirstNav(req));
    return;
  }

  const dest = req.destination;
  if (["script", "style", "image", "font"].includes(dest)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "IDAROOM_CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});
