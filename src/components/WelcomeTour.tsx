import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HandDrawnStar } from "./HandDrawnStar";
import { useAuth } from "@/lib/use-auth";

export const TOUR_STORAGE_PREFIX = "idaroom.tour.v1";

type Step = {
  id: string;
  /** CSS selector of the element to highlight. Omitted for centered steps. */
  target?: string;
};

const STEPS: Step[] = [
  { id: "welcome" },
  { id: "sidebar", target: '[data-tour="sidebar"]' },
  { id: "today", target: '[data-tour="nav-/dashboard/today"]' },
  { id: "attendance", target: '[data-tour="nav-/dashboard/attendance"]' },
  { id: "weekly", target: '[data-tour="nav-/dashboard/weekly"]' },
  { id: "inbox", target: '[data-tour="nav-/dashboard/inbox"]' },
  { id: "calendar", target: '[data-tour="nav-/dashboard/calendar"]' },
  { id: "search", target: '[data-tour="search"]' },
  { id: "diagnostics", target: '[data-tour="nav-/dashboard/diagnostics"]' },
  { id: "console", target: '[data-tour="nav-/dashboard/console"]' },
  { id: "tools", target: '[data-tour="header-tools"]' },
  { id: "help", target: '[data-tour="tour-help"]' },
];

type Rect = { top: number; left: number; width: number; height: number };

function readRect(selector?: string): Rect | null {
  if (!selector || typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function WelcomeTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Only keep steps whose target actually exists for this role/viewport.
  const [steps, setSteps] = useState<Step[]>(STEPS);
  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setSteps(STEPS.filter((s) => !s.target || readRect(s.target)));
  }, [open]);

  const step = steps[index];

  const sync = useCallback(() => {
    setRect(readRect(step?.target));
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = step?.target ? document.querySelector(step.target) : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    sync();
    const id = window.setTimeout(sync, 350);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, step, sync]);

  const finish = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.min(steps.length - 1, Math.max(0, i + 1)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish, steps.length]);

  if (!open || !mounted || !step) return null;

  const pad = 8;
  const spotlight = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Card placement: below the highlight when there is room, otherwise above.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const cardWidth = Math.min(340, vw - 24);
  let cardStyle: React.CSSProperties = {
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: cardWidth,
  };
  if (spotlight) {
    const below = spotlight.top + spotlight.height + 12;
    const fitsBelow = below + 220 < vh;
    const top = fitsBelow ? below : Math.max(12, spotlight.top - 232);
    const left = Math.min(
      Math.max(12, spotlight.left + spotlight.width / 2 - cardWidth / 2),
      vw - cardWidth - 12,
    );
    cardStyle = { top, left, width: cardWidth };
  }

  const isLast = index === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      {/* Dimmed backdrop with a cut-out around the highlighted element */}
      {!spotlight && (
        <div className="absolute inset-0 bg-black/55" onClick={finish} />
      )}
      {spotlight && (
        <>
          {/* Four dim panels leave a clear cut-out around the target */}
          <div
            className="absolute inset-x-0 top-0 bg-black/55"
            style={{ height: Math.max(0, spotlight.top) }}
            onClick={finish}
          />
          <div
            className="absolute inset-x-0 bottom-0 bg-black/55"
            style={{ top: spotlight.top + spotlight.height }}
            onClick={finish}
          />
          <div
            className="absolute left-0 bg-black/55"
            style={{
              top: spotlight.top,
              height: spotlight.height,
              width: Math.max(0, spotlight.left),
            }}
            onClick={finish}
          />
          <div
            className="absolute right-0 bg-black/55"
            style={{
              top: spotlight.top,
              height: spotlight.height,
              left: spotlight.left + spotlight.width,
            }}
            onClick={finish}
          />
          <div
            className="pointer-events-none absolute rounded-xl ring-2 ring-primary"
            style={spotlight}
          />
        </>
      )}


      <div
        className="absolute rounded-xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_hsl(var(--foreground))] transition-all duration-300"
        style={cardStyle}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <HandDrawnStar size={20} className="text-primary" />
            <h2 className="font-display text-lg leading-tight">
              {t(`tour.steps.${step.id}.title`)}
            </h2>
          </div>
          <button
            type="button"
            onClick={finish}
            aria-label={t("tour.skip")}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          {t(`tour.steps.${step.id}.body`)}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={
                  "h-1.5 rounded-full transition-all " +
                  (i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/40")
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIndex((i) => i - 1)}
                className="gap-1"
              >
                <ChevronRight className="h-4 w-4 rtl:hidden" />
                <ChevronLeft className="hidden h-4 w-4 rtl:block" />
                {t("tour.back")}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
              className="gap-1"
            >
              {isLast ? t("tour.done") : t("tour.next")}
            </Button>
          </div>
        </div>

        {!isLast && (
          <button
            type="button"
            onClick={finish}
            className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {t("tour.skip")}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Handles first-run auto-start and exposes a manual restart trigger. */
export function useWelcomeTour() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const key = user ? `${TOUR_STORAGE_PREFIX}.${user.id}` : null;

  useEffect(() => {
    if (!key) return;
    let done = false;
    try {
      done = window.localStorage.getItem(key) === "done";
    } catch {
      done = true;
    }
    if (done) return;
    const id = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(id);
  }, [key]);

  const close = useCallback(() => {
    setOpen(false);
    if (key) {
      try {
        window.localStorage.setItem(key, "done");
      } catch {
        /* storage unavailable */
      }
    }
  }, [key]);

  const start = useCallback(() => setOpen(true), []);

  return { open, start, close };
}
