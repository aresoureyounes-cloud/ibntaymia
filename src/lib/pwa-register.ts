// Single place that registers the offline service worker (/sw.js).
// Refuses in dev, iframes and Lovable preview hosts, and supports ?sw=off.
async function unregisterAppSW() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => (r.active || r.installing || r.waiting)?.scriptURL.endsWith("/sw.js"))
      .map((r) => r.unregister()),
  );
}

function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  const ends = (d: string) => h === d || h.endsWith("." + d);
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (ends("lovableproject.com") || ends("lovableproject-dev.com") || ends("beta.lovable.dev"))
    return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

export function registerAppServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (isRefusedContext()) {
    void unregisterAppSW().catch(() => {});
    return;
  }
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}
