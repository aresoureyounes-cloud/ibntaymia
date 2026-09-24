import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CreditCard,
  Bell,
  Megaphone,
  Award,
  BookOpen,
  Bus,
  FilePenLine,
  BarChart3,
  ShieldCheck,
  GraduationCap,
  ClipboardList,
  ScanLine,
  UserCog,
  Home,
  Settings,
  Star,
  Heart,
  Search,
  Sparkles,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type TaskbarPosition = "top" | "bottom" | "left" | "right";
export type TaskbarStyle = "solid" | "glass" | "floating" | "minimal";
export type TaskbarShape = "rounded" | "pill" | "square";
export type IconStyle = "plain" | "boxed" | "circle";
export type ButtonStyle = "solid" | "outline" | "soft" | "ghost";
/** Material of cards / bars: translucent depth, opaque, or hairline flat. */
export type SurfaceStyle = "glass" | "solid" | "flat";
/** Motion personality. `fluid` = Apple-style springs, interruptible, press-first feedback. */
export type MotionStyle = "fluid" | "crisp" | "none";

export type TaskbarItem = {
  id: string;
  label: string;
  url: string;
  icon: string;
};

export type Taskbar = {
  id: string;
  name: string;
  enabled: boolean;
  position: TaskbarPosition;
  style: TaskbarStyle;
  shape: TaskbarShape;
  size: number;
  color: string;
  iconColor: string;
  iconStyle: IconStyle;
  showLabels: boolean;
  items: TaskbarItem[];
};

export type Appearance = {
  /** When false, nothing is applied and IDAROOM's built-in design stays intact. */
  active: boolean;
  /** Light mode: minimal, low-memory, low-bandwidth rendering. */
  lite: boolean;
  useCustomColors: boolean;

  colors: {
    primary: string;
    accent: string;
    background: string;
    card: string;
    sidebar: string;
    foreground: string;
  };
  radius: number;
  font: {
    scale: number;
    /** Per-language size adjustment (%), applied on top of `scale`. */
    scaleAr?: number;
    scaleFr?: number;
    scaleEn?: number;
    ar: string;
    fr: string;
    en: string;
    headingAr: string;
    headingLatin: string;
  };
  icons: {
    strokeWidth: number;
    size: number;
    color: string;
  };
  buttons: {
    radius: number;
    style: ButtonStyle;
    shadow: boolean;
    scale: number;
  };
  taskbars: Taskbar[];
  /** id of the applied ready-made template (empty = custom). */
  template: string;
  surface: SurfaceStyle;
  motion: MotionStyle;
  /** Depth/elevation intensity of surfaces (0–100). */
  depth: number;
};

/* ------------------------------------------------------------------ */
/* Icon registry                                                       */
/* ------------------------------------------------------------------ */

export const ICON_REGISTRY: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  users: Users,
  attendance: CalendarCheck,
  cards: CreditCard,
  bell: Bell,
  megaphone: Megaphone,
  award: Award,
  book: BookOpen,
  bus: Bus,
  exam: FilePenLine,
  chart: BarChart3,
  shield: ShieldCheck,
  graduation: GraduationCap,
  clipboard: ClipboardList,
  scan: ScanLine,
  profile: UserCog,
  home: Home,
  settings: Settings,
  star: Star,
  heart: Heart,
  search: Search,
  sparkles: Sparkles,
  palette: Palette,
};

export function iconFor(name: string): LucideIcon {
  return ICON_REGISTRY[name] ?? LayoutDashboard;
}

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */

export const ARABIC_FONTS = [
  "Tajawal",
  "Cairo",
  "Almarai",
  "Amiri",
  "Lateef",
  "Aref Ruqaa",
  "Lalezar",
  "Noto Kufi Arabic",
  "Readex Pro",
  "IBM Plex Sans Arabic",
];

export const LATIN_FONTS = [
  "DM Sans",
  "Space Grotesk",
  "Inter",
  "Manrope",
  "Poppins",
  "Roboto",
  "Merriweather",
  "Gloock",
  "Playfair Display",
  "JetBrains Mono",
];

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_APPEARANCE: Appearance = {
  active: false,
  lite: false,
  useCustomColors: false,
  colors: {
    primary: "#4a5d4b",
    accent: "#b5836a",
    background: "#f8f7f4",
    card: "#fdfcfa",
    sidebar: "#f2f0eb",
    foreground: "#24291f",
  },
  radius: 24,
  font: {
    scale: 100,
    scaleAr: 100,
    scaleFr: 100,
    scaleEn: 100,
    ar: "Tajawal",
    fr: "DM Sans",
    en: "DM Sans",
    headingAr: "Aref Ruqaa",
    headingLatin: "Space Grotesk",
  },
  icons: { strokeWidth: 2, size: 100, color: "" },
  buttons: { radius: 28, style: "solid", shadow: false, scale: 100 },
  taskbars: [],
  template: "",
  surface: "glass",
  motion: "fluid",
  depth: 55,
};



/* ------------------------------------------------------------------ */
/* Ready-made templates (design presets)                               */
/* ------------------------------------------------------------------ */

export type TemplatePatch = {
  colors: Appearance["colors"];
  radius: number;
  surface: SurfaceStyle;
  motion: MotionStyle;
  depth: number;
  buttons: Appearance["buttons"];
  fonts: { ar: string; latin: string; headingAr: string; headingLatin: string };
};

export type ThemeTemplate = {
  id: string;
  name: string;
  tagline: string;
  patch: TemplatePatch;
};

export const TEMPLATES: ThemeTemplate[] = [
  {
    id: "apple-clarity",
    name: "Apple Clarity — الوضوح",
    tagline:
      "مواد شبه شفافة بعمق طبقي، حركة زنبركية قابلة للمقاطعة، واستدارة سخيّة. تصميم يتبع مبادئ آبل.",
    patch: {
      colors: {
        primary: "#0a84ff",
        accent: "#30d158",
        background: "#f2f2f7",
        card: "#ffffff",
        sidebar: "#ececf1",
        foreground: "#1c1c1e",
      },
      radius: 22,
      surface: "glass",
      motion: "fluid",
      depth: 70,
      buttons: { radius: 999, style: "solid", shadow: true, scale: 100 },
      fonts: { ar: "IBM Plex Sans Arabic", latin: "Inter", headingAr: "Readex Pro", headingLatin: "Inter" },
    },
  },
  {
    id: "apple-graphite",
    name: "Apple Graphite — رمادي داكن",
    tagline: "سطح داكن هادئ مع لمعة زجاجية وحدود رقيقة، مناسب للعمل الطويل ليلاً.",
    patch: {
      colors: {
        primary: "#64d2ff",
        accent: "#ff9f0a",
        background: "#1c1c1e",
        card: "#2c2c2e",
        sidebar: "#161618",
        foreground: "#f2f2f7",
      },
      radius: 20,
      surface: "glass",
      motion: "fluid",
      depth: 80,
      buttons: { radius: 999, style: "soft", shadow: false, scale: 100 },
      fonts: { ar: "IBM Plex Sans Arabic", latin: "Inter", headingAr: "Readex Pro", headingLatin: "Inter" },
    },
  },
  {
    id: "idaroom",
    name: "إداروم — الرمل والمريمية",
    tagline: "الهوية الأصلية للتطبيق: رمل دافئ، أخضر زيتوني ولمسة تراكوتا.",

    patch: {
      colors: DEFAULT_APPEARANCE.colors,
      radius: 24,
      surface: "glass",
      motion: "fluid",
      depth: 55,
      buttons: { radius: 28, style: "solid", shadow: false, scale: 100 },
      fonts: { ar: "Lateef", latin: "DM Sans", headingAr: "Aref Ruqaa", headingLatin: "Space Grotesk" },
    },
  },
  {
    id: "paper-flat",
    name: "ورق مسطّح — قراءة صافية",
    tagline: "بدون ظلال ولا تمويه: حدود شعرية وتباين عالٍ وتركيز كامل على النص.",
    patch: {
      colors: {
        primary: "#1f2937",
        accent: "#b45309",
        background: "#fbfaf7",
        card: "#ffffff",
        sidebar: "#f3f2ee",
        foreground: "#111827",
      },
      radius: 10,
      surface: "flat",
      motion: "crisp",
      depth: 15,
      buttons: { radius: 12, style: "outline", shadow: false, scale: 100 },
      fonts: { ar: "Amiri", latin: "Merriweather", headingAr: "Amiri", headingLatin: "Gloock" },
    },
  },
  {
    id: "school-blue",
    name: "أزرق المدرسة",
    tagline: "هوية مؤسسية واضحة بأزرق موثوق وبطاقات صلبة مرفوعة قليلاً.",
    patch: {
      colors: {
        primary: "#1d4ed8",
        accent: "#0891b2",
        background: "#f1f5f9",
        card: "#ffffff",
        sidebar: "#e2e8f0",
        foreground: "#0f172a",
      },
      radius: 16,
      surface: "solid",
      motion: "crisp",
      depth: 40,
      buttons: { radius: 14, style: "solid", shadow: true, scale: 100 },
      fonts: { ar: "Tajawal", latin: "DM Sans", headingAr: "Readex Pro", headingLatin: "Manrope" },
    },
  },
  {
    id: "night-focus",
    name: "تركيز ليلي",
    tagline: "أسود عميق مع أخضر نيون، بلا حركة زائدة — أقصى تركيز وأقل إجهاد للعين.",
    patch: {
      colors: {
        primary: "#2dd4a8",
        accent: "#a78bfa",
        background: "#0b1220",
        card: "#131c2e",
        sidebar: "#0a0f1a",
        foreground: "#e8eef7",
      },
      radius: 18,
      surface: "solid",
      motion: "none",
      depth: 25,
      buttons: { radius: 16, style: "soft", shadow: false, scale: 100 },
      fonts: { ar: "Readex Pro", latin: "Space Grotesk", headingAr: "Readex Pro", headingLatin: "Space Grotesk" },
    },
  },
];

/** Apply a ready-made template onto an appearance draft (in place). */
export function applyTemplate(draft: Appearance, tpl: ThemeTemplate) {
  draft.active = true;
  draft.template = tpl.id;
  draft.colors = { ...tpl.patch.colors };
  draft.useCustomColors = true;

  draft.radius = tpl.patch.radius;
  draft.surface = tpl.patch.surface;
  draft.motion = tpl.patch.motion;
  draft.depth = tpl.patch.depth;
  draft.buttons = { ...tpl.patch.buttons };
  draft.font = {
    ...draft.font,
    ar: tpl.patch.fonts.ar,
    fr: tpl.patch.fonts.latin,
    en: tpl.patch.fonts.latin,
    headingAr: tpl.patch.fonts.headingAr,
    headingLatin: tpl.patch.fonts.headingLatin,
  };
}

export const COLOR_PRESETS: { id: string; name: string; colors: Appearance["colors"] }[] = [
  {
    id: "cosma",
    name: "كوزما (افتراضي)",
    colors: DEFAULT_APPEARANCE.colors,
  },
  {
    id: "ocean",
    name: "المحيط",
    colors: {
      primary: "#1d5f8a",
      accent: "#2aa198",
      background: "#eef4f8",
      card: "#f8fbfd",
      sidebar: "#e4edf4",
      foreground: "#16303f",
    },
  },
  {
    id: "royal",
    name: "أرجواني ملكي",
    colors: {
      primary: "#5b3fa8",
      accent: "#c2569b",
      background: "#f5f2fb",
      card: "#fbf9ff",
      sidebar: "#ece6f8",
      foreground: "#2b2340",
    },
  },
  {
    id: "sand",
    name: "صحراوي",
    colors: {
      primary: "#8a5a2b",
      accent: "#c99a2e",
      background: "#f8f2e6",
      card: "#fdf9f1",
      sidebar: "#f0e6d4",
      foreground: "#3a2c1b",
    },
  },
  {
    id: "graphite",
    name: "رمادي هادئ",
    colors: {
      primary: "#3f4a55",
      accent: "#7a8b99",
      background: "#f2f4f6",
      card: "#fafbfc",
      sidebar: "#e8ebee",
      foreground: "#1f272e",
    },
  },
  {
    id: "rose",
    name: "وردي دافئ",
    colors: {
      primary: "#a8324f",
      accent: "#e07a5f",
      background: "#fbf1f2",
      card: "#fff8f8",
      sidebar: "#f6e4e6",
      foreground: "#3a1f26",
    },
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function mergeAppearance(base: Appearance, patch: unknown): Appearance {
  const p = (patch ?? {}) as Partial<Appearance>;
  return {
    ...base,
    ...p,
    colors: { ...base.colors, ...(p.colors ?? {}) },
    font: { ...base.font, ...(p.font ?? {}) },
    icons: { ...base.icons, ...(p.icons ?? {}) },
    buttons: { ...base.buttons, ...(p.buttons ?? {}) },
    taskbars: Array.isArray(p.taskbars) ? p.taskbars : base.taskbars,
  };
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableOn(hex: string): string {
  return luminance(hex) > 0.55 ? "#16201c" : "#ffffff";
}

function shift(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const out = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v + amount * 255))));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function mix(hex: string, other: string, ratio: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  if (!a || !b) return hex;
  const out = a.map((v, i) => Math.round(v * (1 - ratio) + b[i]! * ratio));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/* CSS generation                                                      */
/* ------------------------------------------------------------------ */

const FONT_LINK_ID = "cosma-appearance-fonts";
const STYLE_ID = "cosma-appearance-style";

function ensureFonts(families: string[]) {
  if (typeof document === "undefined") return;
  const uniq = Array.from(new Set(families.filter(Boolean)));
  const query = uniq
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;700`)
    .join("&");
  const href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

export function buildAppearanceCss(a: Appearance): string {
  const parts: string[] = [];
  const rootVars: string[] = [];

  if (a.useCustomColors) {
    const c = a.colors;
    rootVars.push(
      `--background:${c.background}`,
      `--foreground:${c.foreground}`,
      `--card:${c.card}`,
      `--card-foreground:${c.foreground}`,
      `--popover:${c.card}`,
      `--popover-foreground:${c.foreground}`,
      `--primary:${c.primary}`,
      `--primary-foreground:${readableOn(c.primary)}`,
      `--primary-glow:${shift(c.primary, 0.12)}`,
      `--secondary:${mix(c.primary, c.background, 0.55)}`,
      `--secondary-foreground:${c.foreground}`,
      `--muted:${mix(c.background, c.foreground, 0.06)}`,
      `--muted-foreground:${mix(c.foreground, c.background, 0.35)}`,
      `--accent:${c.accent}`,
      `--accent-foreground:${readableOn(c.accent)}`,
      `--border:${mix(c.background, c.foreground, 0.14)}`,
      `--input:${mix(c.background, c.foreground, 0.09)}`,
      `--ring:${c.primary}`,
      `--sidebar:${c.sidebar}`,
      `--sidebar-foreground:${c.foreground}`,
      `--sidebar-primary:${c.primary}`,
      `--sidebar-primary-foreground:${readableOn(c.primary)}`,
      `--sidebar-accent:${mix(c.sidebar, c.foreground, 0.07)}`,
      `--sidebar-accent-foreground:${c.foreground}`,
      `--sidebar-border:${mix(c.sidebar, c.foreground, 0.14)}`,
      `--sidebar-ring:${c.primary}`,
      `--gradient-paper:linear-gradient(180deg, ${shift(c.background, 0.02)} 0%, ${c.background} 100%)`,
    );
  }

  rootVars.push(`--radius:${a.radius / 16}rem`);
  parts.push(`:root{${rootVars.join(";")}}`);

  // Typography — applied automatically site-wide, per document language.
  const SYS_LATIN = `system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
  const SYS_AR = `"Noto Naskh Arabic",system-ui,-apple-system,"Segoe UI",sans-serif`;
  const bodyAr = a.lite ? SYS_AR : `"${a.font.ar}","Tajawal",${SYS_AR}`;
  const bodyFr = a.lite ? SYS_LATIN : `"${a.font.fr}",${SYS_LATIN}`;
  const bodyEn = a.lite ? SYS_LATIN : `"${a.font.en}",${SYS_LATIN}`;
  const headAr = a.lite ? SYS_AR : `"${a.font.headingAr}","Tajawal",${SYS_AR}`;
  const headLatin = a.lite ? SYS_LATIN : `"${a.font.headingLatin}",${SYS_LATIN}`;

  const langs: { code: string; body: string; heading: string; size: number }[] = [
    { code: "ar", body: bodyAr, heading: headAr, size: a.font.scaleAr ?? 100 },
    { code: "fr", body: bodyFr, heading: headLatin, size: a.font.scaleFr ?? 100 },
    { code: "en", body: bodyEn, heading: headLatin, size: a.font.scaleEn ?? 100 },
  ];

  for (const l of langs) {
    const size = Math.round(a.font.scale * (l.size / 100));
    parts.push(`html[lang="${l.code}"]{font-size:${size}%}`);
    // Every element inherits the language font — no per-component overrides needed.
    parts.push(
      `html[lang="${l.code}"] body,html[lang="${l.code}"] body *{font-family:${l.body}}`,
    );
    parts.push(
      `html[lang="${l.code}"] h1,html[lang="${l.code}"] h2,html[lang="${l.code}"] h3,html[lang="${l.code}"] h4,html[lang="${l.code}"] .font-display{font-family:${l.heading}}`,
    );
    // Keep monospace surfaces monospaced.
    parts.push(
      `html[lang="${l.code}"] code,html[lang="${l.code}"] pre,html[lang="${l.code}"] pre *,html[lang="${l.code}"] .font-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}`,
    );
  }
  // Fallback for any other language value.
  parts.push(`html:not([lang="ar"]):not([lang="fr"]):not([lang="en"]){font-size:${a.font.scale}%}`);

  // COSMA Light: strip expensive effects (blur, shadows, animations, gradients).
  if (a.lite) {
    parts.push(
      `*,*::before,*::after{animation:none!important;transition:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;text-shadow:none!important;filter:none!important;mask-image:none!important}`,
      `body{background-image:none!important;background-attachment:scroll!important}`,
      `.glass,[data-slot="card"],.card{background:var(--card)!important}`,
      `[data-cosma-heavy]{display:none!important}`,
      `img,video{content-visibility:auto}`,
    );
  }

  /* ---------------- Surfaces (material & depth) ---------------- */
  if (!a.lite) {
    const d = Math.max(0, Math.min(100, a.depth)) / 100;
    const e1 = `0 1px 2px color-mix(in oklab, var(--foreground) ${(6 * d).toFixed(1)}%, transparent)`;
    const e2 = `0 ${Math.round(10 + 22 * d)}px ${Math.round(20 + 40 * d)}px -${Math.round(8 + 14 * d)}px color-mix(in oklab, var(--foreground) ${(14 * d).toFixed(1)}%, transparent)`;
    const hairline = `inset 0 0 0 1px color-mix(in oklab, var(--foreground) ${(8 * d + 4).toFixed(1)}%, transparent)`;

    if (a.surface === "glass") {
      parts.push(
        `[data-slot="card"],.card,.glass{background:color-mix(in oklab, var(--card) ${Math.round(88 - 26 * d)}%, transparent)!important;backdrop-filter:blur(${Math.round(8 + 22 * d)}px) saturate(180%);-webkit-backdrop-filter:blur(${Math.round(8 + 22 * d)}px) saturate(180%);box-shadow:${e1},${e2},${hairline}}`,
        `[data-slot="popover-content"],[data-slot="dropdown-menu-content"],[data-slot="dialog-content"],[data-slot="select-content"]{backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);box-shadow:${e2},${hairline}}`,
      );
    } else if (a.surface === "solid") {
      parts.push(
        `[data-slot="card"],.card,.glass{background:var(--card)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:${e1},${e2}}`,
      );
    } else {
      parts.push(
        `[data-slot="card"],.card,.glass{background:var(--card)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none;border:1px solid color-mix(in oklab, var(--foreground) 12%, transparent)}`,
      );
    }
  }

  /* ---------------- Motion (Apple-style fluidity) ---------------- */
  if (!a.lite && a.motion !== "none") {
    const spring =
      a.motion === "fluid" ? "cubic-bezier(0.22, 1.2, 0.36, 1)" : "cubic-bezier(0.2, 0, 0, 1)";
    const dur = a.motion === "fluid" ? 420 : 180;
    parts.push(
      // Response: feedback lands on pointer-down, never on release.
      `button,[role="button"],[data-slot="button"],a[data-slot="sidebar-menu-button"]{transition:transform 110ms ease-out,background-color ${dur}ms ${spring},color ${dur}ms ${spring},box-shadow ${dur}ms ${spring};will-change:transform}`,
      `button:active,[role="button"]:active,[data-slot="button"]:active{transform:scale(0.965)}`,
      `[data-slot="card"]{transition:transform ${dur}ms ${spring},box-shadow ${dur}ms ${spring}}`,
      `[data-slot="switch"],[data-slot="switch-thumb"]{transition:all ${dur}ms ${spring}}`,
      `[data-slot="dialog-content"],[data-slot="popover-content"],[data-slot="select-content"]{animation:cosma-sheet-in ${dur}ms ${spring}}`,
      `@keyframes cosma-sheet-in{from{opacity:0;transform:translateY(10px) scale(0.985)}to{opacity:1;transform:none}}`,
      `@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:1ms!important;transition-duration:1ms!important}}`,
    );
    if (a.motion === "fluid") {
      parts.push(
        `[data-slot="card"]:hover{transform:translateY(-2px)}`,
        // Optical typography: tighter tracking as type grows.
        `h1{letter-spacing:-0.022em}h2{letter-spacing:-0.017em}h3{letter-spacing:-0.012em}`,
      );
    }
  }
  if (a.motion === "none") {
    parts.push(`*,*::before,*::after{animation:none!important;transition:none!important}`);
  }


  // Icons
  parts.push(
    `svg.lucide{stroke-width:${a.icons.strokeWidth};width:calc(1em * ${a.icons.size / 100} * 1.15);height:calc(1em * ${a.icons.size / 100} * 1.15)}`,
  );
  if (a.icons.color) parts.push(`svg.lucide{color:${a.icons.color}}`);

  // Buttons
  const br = a.buttons.radius;
  parts.push(
    `button,[role="button"],.btn,[data-slot="button"]{border-radius:${br}px;font-size:${a.buttons.scale}%}`,
  );
  if (a.buttons.shadow) {
    parts.push(`[data-slot="button"]{box-shadow:0 6px 18px -8px color-mix(in oklab, var(--primary) 60%, transparent)}`);
  }
  if (a.buttons.style === "outline") {
    parts.push(
      `[data-slot="button"]{background:transparent!important;color:var(--primary)!important;border:1.5px solid var(--primary)!important}`,
    );
  } else if (a.buttons.style === "soft") {
    parts.push(
      `[data-slot="button"]{background:color-mix(in oklab, var(--primary) 16%, transparent)!important;color:var(--primary)!important;border:none}`,
    );
  } else if (a.buttons.style === "ghost") {
    parts.push(
      `[data-slot="button"]{background:transparent!important;color:var(--foreground)!important;border:none}`,
    );
  }

  return parts.join("\n");
}

export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  if (!a.active) {
    // Nothing chosen yet — leave IDAROOM's built-in design completely untouched.
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(FONT_LINK_ID)?.remove();
    delete document.documentElement.dataset["lite"];
    return;
  }
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildAppearanceCss(a);
  document.documentElement.dataset["lite"] = a.lite ? "on" : "off";
  if (a.lite) {
    // No webfont downloads at all in Light mode.
    document.getElementById(FONT_LINK_ID)?.remove();
  } else {
    ensureFonts([
      a.font.ar,
      a.font.en,
      a.font.fr,
      a.font.headingAr,
      a.font.headingLatin,
    ]);
  }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "cosma-appearance";

type Ctx = {
  appearance: Appearance;
  globalAppearance: Appearance | null;
  setAppearance: (next: Appearance) => void;
  update: (fn: (draft: Appearance) => void) => void;
  reset: () => void;
  saving: boolean;
  saveForMe: () => Promise<void>;
  saveForEveryone: () => Promise<void>;
  useGlobal: () => Promise<void>;
};

const AppearanceContext = createContext<Ctx | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [appearance, setAppearanceState] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [globalAppearance, setGlobalAppearance] = useState<Appearance | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedForUser = useRef<string | null>(null);

  // Local (instant) restore
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setAppearanceState(mergeAppearance(DEFAULT_APPEARANCE, JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  // Apply on every change + persist locally
  useEffect(() => {
    applyAppearance(appearance);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      /* ignore */
    }
  }, [appearance]);

  // Remote load: global default first, then the user's own override.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("appearance_settings")
        .select("user_id,is_global,settings");
      if (cancelled || !data) return;
      const globalRow = data.find((r) => r.is_global);
      const mine = user ? data.find((r) => r.user_id === user.id) : undefined;
      const globalMerged = globalRow
        ? mergeAppearance(DEFAULT_APPEARANCE, globalRow.settings)
        : null;
      setGlobalAppearance(globalMerged);
      if (loadedForUser.current === (user?.id ?? "anon")) return;
      loadedForUser.current = user?.id ?? "anon";
      const base = globalMerged ?? DEFAULT_APPEARANCE;
      if (mine) setAppearanceState(mergeAppearance(base, mine.settings));
      else if (globalMerged) setAppearanceState(globalMerged);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = useCallback((fn: (draft: Appearance) => void) => {
    setAppearanceState((prev) => {
      const draft = clone(prev);
      fn(draft);
      // Any deliberate change switches the custom appearance engine on.
      draft.active = true;
      return draft;
    });
  }, []);


  const saveForMe = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase
        .from("appearance_settings")
        .upsert(
          { user_id: user.id, is_global: false, settings: appearance as never },
          { onConflict: "user_id" },
        );
    } finally {
      setSaving(false);
    }
  }, [user, appearance]);

  const saveForEveryone = useCallback(async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("appearance_settings")
        .select("id")
        .eq("is_global", true)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("appearance_settings")
          .update({ settings: appearance as never })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("appearance_settings")
          .insert({ is_global: true, settings: appearance as never });
      }
      setGlobalAppearance(appearance);
    } finally {
      setSaving(false);
    }
  }, [appearance]);

  const useGlobal = useCallback(async () => {
    if (user) {
      await supabase.from("appearance_settings").delete().eq("user_id", user.id);
    }
    setAppearanceState(globalAppearance ?? DEFAULT_APPEARANCE);
  }, [user, globalAppearance]);

  const reset = useCallback(() => setAppearanceState(DEFAULT_APPEARANCE), []);

  const value = useMemo<Ctx>(
    () => ({
      appearance,
      globalAppearance,
      setAppearance: setAppearanceState,
      update,
      reset,
      saving,
      saveForMe,
      saveForEveryone,
      useGlobal,
    }),
    [appearance, globalAppearance, update, reset, saving, saveForMe, saveForEveryone, useGlobal],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within AppearanceProvider");
  return ctx;
}

export function newTaskbar(index: number): Taskbar {
  return {
    id: Math.random().toString(36).slice(2, 9),
    name: `شريط ${index + 1}`,
    enabled: true,
    position: "bottom",
    style: "glass",
    shape: "pill",
    size: 48,
    color: "",
    iconColor: "",
    iconStyle: "plain",
    showLabels: false,
    items: [
      { id: "a", label: "الرئيسية", url: "/dashboard", icon: "dashboard" },
      { id: "b", label: "التلاميذ", url: "/dashboard/students", icon: "users" },
      { id: "c", label: "الإشعارات", url: "/dashboard/notifications", icon: "bell" },
      { id: "d", label: "المظهر", url: "/dashboard/appearance", icon: "palette" },
    ],
  };
}
