import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import appCss from "../styles.css?url";
import "../i18n/config";
import { applyLanguageToDocument } from "../i18n/config";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ThemeProvider } from "@/lib/theme";
import { watchAppearance } from "@/lib/appearance";
import { AppearanceProvider } from "@/lib/cosma-appearance";

import { OfflineBanner } from "@/components/OfflineBanner";
import { APP_VERSION } from "@/lib/app-version";
import { applyAppUpdate, type UpdateProgress, type RemoteVersion } from "@/lib/use-app-update";
import { UpdateProgressDialog } from "@/components/UpdateProgressDialog";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-4 text-muted-foreground">
          الصفحة غير موجودة · Page introuvable · Page not found
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          ← Home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "إداروم — النظام الرقمي للمؤسسات التعليمية" },
      {
        name: "description",
        content:
          "منصة إداروم: إدارة هجينة (Online/Offline) للمدارس الجزائرية. شارة رقمية موحدة، تسجيل حضور فوري، إشعارات للأولياء، وتحكم يدوي كامل.",
      },
      { property: "og:title", content: "إداروم — النظام الرقمي للمؤسسات التعليمية" },
      {
        property: "og:description",
        content:
          "منصة إداروم: إدارة هجينة (Online/Offline) للمدارس الجزائرية. شارة رقمية موحدة، تسجيل حضور فوري، إشعارات للأولياء، وتحكم يدوي كامل.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "إداروم — النظام الرقمي للمؤسسات التعليمية" },
      {
        name: "twitter:description",
        content:
          "منصة إداروم: إدارة هجينة (Online/Offline) للمدارس الجزائرية. شارة رقمية موحدة، تسجيل حضور فوري، إشعارات للأولياء، وتحكم يدوي كامل.",
      },
      { property: "og:site_name", content: "IDAROOM" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a3e747fc-4158-4f8d-8753-399509d3b879/id-preview-04056949--40b10812-a235-43e8-8957-9d63de1dcd94.lovable.app-1783532087094.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a3e747fc-4158-4f8d-8753-399509d3b879/id-preview-04056949--40b10812-a235-43e8-8957-9d63de1dcd94.lovable.app-1783532087094.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Space+Grotesk:wght@300..700&family=Playwrite+BE+VLG:wght@100..400&family=Gloock&family=Tajawal:wght@400;500;700;900&family=Aref+Ruqaa:wght@400;700&family=Lateef:wght@400;700&family=Lalezar&display=swap",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/idaroom-logo.png" },
      { rel: "icon", type: "image/png", href: "/idaroom-logo.png" },
    ],
    htmlAttrs: { lang: "ar", dir: "rtl" },
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const { i18n } = useTranslation();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateRemote, setUpdateRemote] = useState<RemoteVersion | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress>({
    stage: "idle",
    percent: 0,
    message: "",
  });

  const startUpdate = (r: RemoteVersion | null) => {
    setUpdateRemote(r);
    setUpdateProgress({ stage: "downloading", percent: 5, message: "بدء التحديث..." });
    setUpdateOpen(true);
    void applyAppUpdate((p) => setUpdateProgress(p));
  };

  // Sync document lang/dir with i18n
  useEffect(() => {
    applyLanguageToDocument(i18n.language);
    const onChange = (lng: string) => applyLanguageToDocument(lng);
    i18n.on("languageChanged", onChange);
    return () => i18n.off("languageChanged", onChange);
  }, [i18n]);

  // Apply the saved appearance preferences (accent, text size, motion)
  useEffect(() => watchAppearance(), []);

  // Invalidate router on auth state change so loaders re-run
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // Register the offline service worker (production only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!import.meta.env.PROD) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // Background auto-check for app updates (production only).
  // Notifies the user with an actionable toast so they can update in place
  // without reinstalling the desktop package or refreshing manually.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!import.meta.env.PROD) return;
    let cancelled = false;
    let notified = false;

    const cmp = (a: string, b: string) => {
      const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
      const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) return d;
      }
      return 0;
    };

    async function tick() {
      if (cancelled || notified || !navigator.onLine) return;
      try {
        const res = await fetch("/version.json?_=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { version: string };
        if (data?.version && cmp(data.version, APP_VERSION) > 0) {
          notified = true;
          toast.message(`تحديث جديد متاح — v${data.version}`, {
            description: "اضغط «تحديث الآن» لتطبيقه فوراً بدون إعادة تثبيت.",
            duration: Infinity,
            action: {
              label: "تحديث الآن",
              onClick: () => {
                startUpdate({ version: data.version });
              },
            },
          });
        }
      } catch {
        /* ignore network errors */
      }
    }

    // Initial check after a short delay, then every 30 min, and on focus.
    const initial = window.setTimeout(tick, 4000);
    const interval = window.setInterval(tick, 30 * 60 * 1000);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);


  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppearanceProvider>
          <OfflineBanner />
          <Outlet />
          <Toaster richColors position="top-center" />
          <UpdateProgressDialog open={updateOpen} progress={updateProgress} remote={updateRemote} />
        </AppearanceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

