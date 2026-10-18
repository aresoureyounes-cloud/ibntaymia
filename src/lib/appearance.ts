/**
 * Per-user appearance preferences (accent colour, text size, corner radius,
 * reduced motion). Stored locally so the choice survives reloads and applies
 * instantly without a round-trip.
 */

export type AccentId = "navy" | "sage" | "terracotta" | "indigo" | "plum" | "teal";
export type DensityId = "compact" | "cozy" | "roomy";

export type Appearance = {
  accent: AccentId;
  fontScale: number; // 0.9 – 1.2
  density: DensityId;
  reducedMotion: boolean;
};

export const ACCENTS: Record<
  AccentId,
  { swatch: string; light: Record<string, string>; dark: Record<string, string> }
> = {
  navy: {
    swatch: "oklch(0.42 0.09 258)",
    light: {
      "--primary": "oklch(0.42 0.09 258)",
      "--primary-glow": "oklch(0.55 0.11 250)",
      "--ring": "oklch(0.42 0.09 258)",
      "--accent": "oklch(0.55 0.11 250)",
    },
    dark: {
      "--primary": "oklch(0.68 0.12 250)",
      "--primary-glow": "oklch(0.78 0.1 245)",
      "--ring": "oklch(0.68 0.12 250)",
      "--accent": "oklch(0.68 0.12 250)",
    },
  },
  sage: {
    swatch: "oklch(0.52 0.06 145)",
    light: {
      "--primary": "oklch(0.52 0.06 145)",
      "--primary-glow": "oklch(0.62 0.07 145)",
      "--ring": "oklch(0.52 0.06 145)",
      "--accent": "oklch(0.62 0.09 55)",
    },
    dark: {
      "--primary": "oklch(0.65 0.06 145)",
      "--primary-glow": "oklch(0.75 0.07 145)",
      "--ring": "oklch(0.65 0.06 145)",
      "--accent": "oklch(0.68 0.09 55)",
    },
  },
  terracotta: {
    swatch: "oklch(0.58 0.11 45)",
    light: {
      "--primary": "oklch(0.55 0.11 45)",
      "--primary-glow": "oklch(0.66 0.12 48)",
      "--ring": "oklch(0.55 0.11 45)",
      "--accent": "oklch(0.60 0.07 145)",
    },
    dark: {
      "--primary": "oklch(0.68 0.11 45)",
      "--primary-glow": "oklch(0.77 0.11 48)",
      "--ring": "oklch(0.68 0.11 45)",
      "--accent": "oklch(0.68 0.07 145)",
    },
  },
  indigo: {
    swatch: "oklch(0.52 0.11 265)",
    light: {
      "--primary": "oklch(0.50 0.11 265)",
      "--primary-glow": "oklch(0.62 0.12 265)",
      "--ring": "oklch(0.50 0.11 265)",
      "--accent": "oklch(0.62 0.09 55)",
    },
    dark: {
      "--primary": "oklch(0.66 0.11 265)",
      "--primary-glow": "oklch(0.75 0.11 265)",
      "--ring": "oklch(0.66 0.11 265)",
      "--accent": "oklch(0.68 0.09 55)",
    },
  },
  plum: {
    swatch: "oklch(0.50 0.10 330)",
    light: {
      "--primary": "oklch(0.48 0.10 330)",
      "--primary-glow": "oklch(0.60 0.11 330)",
      "--ring": "oklch(0.48 0.10 330)",
      "--accent": "oklch(0.62 0.08 30)",
    },
    dark: {
      "--primary": "oklch(0.66 0.10 330)",
      "--primary-glow": "oklch(0.75 0.11 330)",
      "--ring": "oklch(0.66 0.10 330)",
      "--accent": "oklch(0.68 0.08 30)",
    },
  },
  teal: {
    swatch: "oklch(0.54 0.08 195)",
    light: {
      "--primary": "oklch(0.50 0.08 195)",
      "--primary-glow": "oklch(0.62 0.09 195)",
      "--ring": "oklch(0.50 0.08 195)",
      "--accent": "oklch(0.62 0.09 55)",
    },
    dark: {
      "--primary": "oklch(0.68 0.08 195)",
      "--primary-glow": "oklch(0.77 0.09 195)",
      "--ring": "oklch(0.68 0.08 195)",
      "--accent": "oklch(0.68 0.09 55)",
    },
  },
};

export const DENSITY_RADIUS: Record<DensityId, string> = {
  compact: "0.75rem",
  cozy: "1.5rem",
  roomy: "2rem",
};

export const DEFAULT_APPEARANCE: Appearance = {
  accent: "navy",
  fontScale: 1,
  density: "compact",
  reducedMotion: false,
};

const STORAGE_KEY = "idaroom.appearance.v1";

export function loadAppearance(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      accent: parsed.accent && parsed.accent in ACCENTS ? parsed.accent : DEFAULT_APPEARANCE.accent,
      fontScale:
        typeof parsed.fontScale === "number" && parsed.fontScale >= 0.85 && parsed.fontScale <= 1.25
          ? parsed.fontScale
          : 1,
      density:
        parsed.density && parsed.density in DENSITY_RADIUS
          ? parsed.density
          : DEFAULT_APPEARANCE.density,
      reducedMotion: !!parsed.reducedMotion,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(a: Appearance) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* storage may be unavailable */
  }
}

/** Write the preference onto :root so every token-based class follows it. */
export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const vars = ACCENTS[a.accent]?.[isDark ? "dark" : "light"] ?? {};
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.setProperty("--radius", DENSITY_RADIUS[a.density]);
  root.style.fontSize = `${Math.round(a.fontScale * 100)}%`;
  root.dataset["reducedMotion"] = a.reducedMotion ? "true" : "false";
}

/** Re-apply on boot and whenever light/dark flips. */
export function watchAppearance(): () => void {
  if (typeof document === "undefined") return () => {};
  const run = () => applyAppearance(loadAppearance());
  run();
  const obs = new MutationObserver(run);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}
