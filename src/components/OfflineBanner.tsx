import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Small persistent banner that appears when the browser reports offline.
 * Pairs with the service worker: the SW serves the last cached page and
 * this banner explains that the content shown is temporary/stale.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center gap-2 bg-amber-600 px-4 py-2 text-center text-xs font-semibold text-white shadow-md sm:text-sm"
    >
      <WifiOff className="h-4 w-4" />
      <span>
        أنت غير متصل — يتم عرض آخر صفحة محفوظة. المحتوى مؤقت وقد لا يكون محدّثاً.
      </span>
    </div>
  );
}
