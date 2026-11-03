/**
 * IDAROOM command engine — powers both the in-app terminal
 * (/dashboard/console) and the Linux CLI wrapper (`idaroom <command>`),
 * so the same verbs work in the terminal and in the UI.
 */

import { APP_VERSION, RELEASE_DATE, CHANGELOG } from "@/lib/app-version";
import { NAV_ITEMS, canAccess } from "@/lib/nav-config";
import type { AppRole } from "@/lib/use-auth";

export type ConsoleLine = { kind: "in" | "out" | "err" | "info"; text: string };

export type ConsoleContext = {
  roles: AppRole[];
  email: string | null;
  navigate: (to: string) => void;
  setTheme: (t: "light" | "dark") => void;
  theme: "light" | "dark";
  setLanguage: (lng: string) => void;
  language: string;
  signOut: () => Promise<void>;
  checkUpdate: () => Promise<{ version: string } | null>;
  applyUpdate: () => void;
  clear: () => void;
};

export type CommandSpec = {
  name: string;
  usage: string;
  description: string;
  run: (args: string[], ctx: ConsoleContext) => Promise<string[]> | string[];
};

function humanRoutes(roles: AppRole[]): string[] {
  return NAV_ITEMS.filter((i) => canAccess(i.url, roles)).map((i) => i.url);
}

export const COMMANDS: CommandSpec[] = [
  {
    name: "help",
    usage: "help [command]",
    description: "عرض قائمة الأوامر المتاحة",
    run: (args) => {
      if (args[0]) {
        const c = COMMANDS.find((x) => x.name === args[0]);
        return c ? [`${c.usage} — ${c.description}`] : [`أمر غير معروف: ${args[0]}`];
      }
      return [
        "الأوامر المتاحة:",
        ...COMMANDS.map((c) => `  ${c.usage.padEnd(28)} ${c.description}`),
      ];
    },
  },
  {
    name: "version",
    usage: "version",
    description: "عرض رقم إصدار التطبيق",
    run: () => [`IDAROOM v${APP_VERSION} (${RELEASE_DATE})`],
  },
  {
    name: "changelog",
    usage: "changelog [n]",
    description: "عرض سجل التغييرات",
    run: (args) => {
      const n = Math.max(1, parseInt(args[0] ?? "2", 10) || 2);
      const out: string[] = [];
      for (const e of CHANGELOG.slice(0, n)) {
        out.push(`v${e.version} — ${e.date}`);
        e.notes.forEach((note) => out.push(`  • ${note}`));
      }
      return out;
    },
  },
  {
    name: "whoami",
    usage: "whoami",
    description: "عرض الحساب الحالي وأدواره",
    run: (_a, ctx) => [
      `المستخدم: ${ctx.email ?? "غير مسجّل"}`,
      `الأدوار: ${ctx.roles.length ? ctx.roles.join(", ") : "—"}`,
    ],
  },
  {
    name: "routes",
    usage: "routes",
    description: "عرض الصفحات المتاحة لحسابك",
    run: (_a, ctx) => ["الصفحات المتاحة:", ...humanRoutes(ctx.roles).map((r) => `  ${r}`)],
  },
  {
    name: "goto",
    usage: "goto <path>",
    description: "فتح صفحة داخل التطبيق",
    run: (args, ctx) => {
      const raw = args[0];
      if (!raw) return ["استعمال: goto /dashboard/students"];
      const path = raw.startsWith("/") ? raw : `/dashboard/${raw}`;
      if (path.startsWith("/dashboard") && !canAccess(path, ctx.roles)) {
        return [`ليست لديك صلاحية الوصول إلى ${path}`];
      }
      ctx.navigate(path);
      return [`الانتقال إلى ${path}`];
    },
  },
  {
    name: "theme",
    usage: "theme [light|dark|toggle]",
    description: "تغيير مظهر التطبيق",
    run: (args, ctx) => {
      const a = args[0];
      if (!a) return [`المظهر الحالي: ${ctx.theme}`];
      const next = a === "toggle" ? (ctx.theme === "dark" ? "light" : "dark") : a;
      if (next !== "light" && next !== "dark") return ["القيم المسموحة: light | dark | toggle"];
      ctx.setTheme(next);
      return [`تم ضبط المظهر على ${next}`];
    },
  },
  {
    name: "lang",
    usage: "lang [ar|fr|en]",
    description: "تغيير لغة الواجهة",
    run: (args, ctx) => {
      const a = args[0];
      if (!a) return [`اللغة الحالية: ${ctx.language}`];
      if (!["ar", "fr", "en"].includes(a)) return ["القيم المسموحة: ar | fr | en"];
      ctx.setLanguage(a);
      return [`تم ضبط اللغة على ${a}`];
    },
  },
  {
    name: "update",
    usage: "update [check|now]",
    description: "التحقق من التحديثات أو تطبيقها",
    run: async (args, ctx) => {
      const sub = args[0] ?? "check";
      if (sub === "now") {
        ctx.applyUpdate();
        return ["بدء التحديث..."];
      }
      const r = await ctx.checkUpdate();
      if (!r) return ["تعذّر التحقق من التحديثات — تحقّق من الاتصال."];
      return r.version !== APP_VERSION
        ? [`يتوفّر تحديث: v${r.version} — نفّذ: update now`]
        : [`أنت على أحدث إصدار (v${APP_VERSION})`];
    },
  },
  {
    name: "cache",
    usage: "cache [status|clear]",
    description: "إدارة التخزين المؤقت وعمل أوفلاين",
    run: async (args) => {
      const sub = args[0] ?? "status";
      if (typeof caches === "undefined") return ["التخزين المؤقت غير مدعوم في هذا المتصفح."];
      const keys = await caches.keys();
      if (sub === "clear") {
        await Promise.all(keys.map((k) => caches.delete(k)));
        return [`تم مسح ${keys.length} من مخازن الكاش.`];
      }
      return [`عدد المخازن: ${keys.length}`, ...keys.map((k) => `  ${k}`)];
    },
  },
  {
    name: "status",
    usage: "status",
    description: "ملخص حالة التطبيق",
    run: (_a, ctx) => [
      `الإصدار: v${APP_VERSION}`,
      `الاتصال: ${typeof navigator !== "undefined" && navigator.onLine ? "متصل" : "غير متصل"}`,
      `المستخدم: ${ctx.email ?? "غير مسجّل"}`,
      `الأدوار: ${ctx.roles.join(", ") || "—"}`,
      `اللغة: ${ctx.language} · المظهر: ${ctx.theme}`,
      `البيئة: ${typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent) ? "تطبيق سطح المكتب" : "متصفح"}`,
    ],
  },
  {
    name: "health",
    usage: "health",
    description: "فحص اتصال الخادم والخدمات",
    run: async () => {
      try {
        const res = await fetch("/api/public/cli", { headers: { accept: "application/json" } });
        const d = await res.json();
        return [
          `الويب: ${d.services?.web ? "OK" : "FAIL"}`,
          `الخادم: ${d.services?.backend ? "OK" : "FAIL"}`,
          `النتيجة: ${d.healthy ? "سليم" : "يوجد خلل"}`,
        ];
      } catch (e) {
        return [`تعذّر الفحص: ${e instanceof Error ? e.message : String(e)}`];
      }
    },
  },
  {
    name: "ping",
    usage: "ping",
    description: "قياس زمن استجابة الخادم",
    run: async () => {
      const t0 = performance.now();
      try {
        await fetch("/api/public/cli", { cache: "no-store" });
        return [`${Math.round(performance.now() - t0)} ms`];
      } catch {
        return ["لا يوجد اتصال بالخادم."];
      }
    },
  },
  {
    name: "cli",
    usage: "cli",
    description: "أوامر الطرفية الحقيقية في لينكس (idaroom ...)",
    run: () => [
      "أداة سطر أوامر مستقلة (بدون واجهة، Node.js 18+) — التثبيت بأمر واحد:",
      `  curl -fsSL ${window.location.origin}/cli/install.sh | IDAROOM_BASE_URL=${window.location.origin} sh`,
      `  curl -fsSL ${window.location.origin}/cli/install.sh | sudo env IDAROOM_BASE_URL=${window.location.origin} sh`,
      "",
      "أوامر الأداة المستقلة:",
      "  idaroom shell                        وضع تفاعلي: موجه مباشر وأوامر متسلسلة",
      "  idaroom status | health | ping | version | changelog | routes | config",
      "  idaroom doctor [--fix] [--dry-run]   فحص وإصلاح البيئة",
      "  idaroom watch --every 30             مراقبة مستمرة للصحة",
      "  idaroom open /dashboard/students     فتح صفحة في المتصفح",
      "",
      "إدارة الحسابات التجريبية (تتطلب صلاحية admin — نطاق demo.idarroom.dz فقط):",
      "  export IDAROOM_ADMIN_EMAIL=admin@demo.idarroom.dz IDAROOM_ADMIN_PASSWORD=…",
      "  idaroom demo list                                   عرض كل الحسابات وأدوارها وأقسامها وبطاقاتها",
      "  idaroom demo create teacher.chem --role teacher --name \"أستاذ كيمياء\"",
      "  idaroom demo password student9 --password 'NewPass@2026'",
      "  idaroom demo disable student9 | idaroom demo enable student9",
      "  idaroom demo link student9 --class \"أولى ثانوي - علوم\" --card 04A1B2C9",
      "",

      "أو بعد تثبيت حزمة .deb (تطبيق سطح المكتب + نفس الأمر):",

      "  idaroom                      فتح التطبيق",
      "  idaroom dashboard            فتح لوحة التحكم",
      "  idaroom console              فتح الطرفية داخل التطبيق",
      "  idaroom open /dashboard/students --fullscreen",
      "  idaroom status --json        حالة النظام بصيغة JSON",
      "  idaroom health && echo OK    فحص سريع مع رمز خروج",
      "  idaroom doctor              فحص التبعيات والإعدادات وsystemd والبيئة",
      "  idaroom doctor --fix        إصلاح تلقائي (ملفات env، أذونات المجلدات، systemd)",
      "  idaroom doctor --fix --dry-run   معاينة الإصلاحات دون تنفيذها",
      "  sudo idaroom doctor --fix   للإصلاحات التي تحتاج صلاحيات الجذر",
      "  idaroom doctor --json | jq .summary",
      "  idaroom ping | info | config | routes | version | help",
      "  idaroom browser /dashboard   فتح الصفحة في متصفح النظام",
      "  idaroom --url http://localhost:8080 console",
      "",
      "السجلات والتشخيص (تُطبع على stderr فقط):",
      "  -V, --verbose                سجلات تشخيصية (كرّرها -vv لأقصى تفصيل)",
      "  -q, --quiet                  أخطاء فقط",
      "      --log-level <lvl>        silent|error|warn|info|debug|trace",
      "      --no-color               تعطيل الألوان",
      "      --json                   سجلات وأخطاء بصيغة JSON للسكربتات",
      "      --timeout <ms>           مهلة الاتصال (افتراضي 10000)",
      "  مثال: idaroom health -V 2> idaroom.log",
      "",
      "الإعداد عبر البيئة (وملفات KEY=value):",
      "  /etc/idaroom/idaroom.env · ~/.config/idaroom/idaroom.env · $IDAROOM_CONFIG",
      "  IDAROOM_URL · IDAROOM_LOG_LEVEL · IDAROOM_VERBOSE · IDAROOM_QUIET",
      "  IDAROOM_JSON · IDAROOM_NO_COLOR · IDAROOM_TIMEOUT · IDAROOM_COMMAND · IDAROOM_PAGE",
      "  مثال: IDAROOM_LOG_LEVEL=debug idaroom health",
      "",
      "خدمات systemd (تُثبَّت مع حزمة .deb):",
      "  systemctl --user enable --now idaroom.service      تشغيل التطبيق عند الدخول",
      "  sudo systemctl enable --now idaroom-health.timer   فحص صحة كل 15 دقيقة",
      "  journalctl -u idaroom-health -f                    متابعة سجلات الفحص",
      "",
      "رموز الخروج: 0 نجاح · 1 خلل في الخدمة · 2 تعذّر الاتصال · 3 أمر/خيار غير معروف · 4 رد غير صالح · 5 خطأ داخلي · 6 إصلاحات تحتاج sudo · 7 فشل إصلاح",
    ],
  },

  {
    name: "logout",

    usage: "logout",
    description: "تسجيل الخروج",
    run: async (_a, ctx) => {
      await ctx.signOut();
      return ["تم تسجيل الخروج."];
    },
  },
  {
    name: "clear",
    usage: "clear",
    description: "مسح الشاشة",
    run: (_a, ctx) => {
      ctx.clear();
      return [];
    },
  },
];

export async function runCommand(input: string, ctx: ConsoleContext): Promise<ConsoleLine[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const [name, ...args] = trimmed.split(/\s+/);
  const cmd = COMMANDS.find((c) => c.name === name.toLowerCase());
  if (!cmd) {
    return [{ kind: "err", text: `أمر غير معروف: ${name} — اكتب help للمساعدة.` }];
  }
  try {
    const out = await cmd.run(args, ctx);
    return out.map((text) => ({ kind: "out" as const, text }));
  } catch (e) {
    return [{ kind: "err", text: `خطأ: ${e instanceof Error ? e.message : String(e)}` }];
  }
}
