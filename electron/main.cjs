// Electron main process — IDAROOM behaves either as a desktop app (window +
// splash) or as a real Linux command line tool: headless commands print to
// stdout and exit without ever opening a window.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_URL = require("./deployment.json").url || "";
const APP_URL = process.env.IDAROOM_URL || DEFAULT_URL;

const APP_VERSION = "1.1.0";
// Local server on the school network (router). Used when the internet is down.
const LOCAL_URL = process.env.IDAROOM_LOCAL_URL || "";

// Commands that never open a window — they behave like any Linux utility.
const HEADLESS = new Set(["version", "help", "status", "health", "info", "routes", "config", "ping", "doctor"]);

const KNOWN_COMMANDS = [
  "open", "version", "help", "settings", "console", "dashboard", "url",
  "status", "health", "info", "routes", "config", "ping", "browser", "doctor",
];

// Precise, documented exit codes so scripts can branch on failures.
const EXIT = {
  OK: 0,          // success
  UNHEALTHY: 1,   // reachable but a service reported a failure
  NETWORK: 2,     // could not reach the server (DNS/TCP/TLS/timeout)
  USAGE: 3,       // unknown command or bad option
  PROTOCOL: 4,    // server answered but the payload was invalid
  INTERNAL: 5,    // unexpected internal error
  NEEDROOT: 6,    // doctor --fix: repairs are pending and require root
  FIXFAILED: 7,   // doctor --fix: at least one repair could not be applied
};

// ------------------------------------------------------------------- logging
// Structured, tagged logs on stderr so stdout stays machine-parsable.
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };
const LEVEL_TAG = { error: "ERROR", warn: " WARN", info: " INFO", debug: "DEBUG", trace: "TRACE" };
const COLORS = { error: "\x1b[31m", warn: "\x1b[33m", info: "\x1b[36m", debug: "\x1b[90m", trace: "\x1b[90m" };

const logger = {
  level: LEVELS.warn,
  json: false,
  color: process.stderr.isTTY && !process.env.NO_COLOR,
  t0: Date.now(),
  configure(opts) {
    this.level = LEVELS[opts.logLevel] ?? LEVELS.warn;
    this.json = !!opts.json;
    if (opts.noColor) this.color = false;
  },
  write(level, tag, msg, extra) {
    if (LEVELS[level] > this.level) return;
    const ts = new Date().toISOString();
    if (this.json) {
      process.stderr.write(
        JSON.stringify({ ts, level, tag, msg, elapsedMs: Date.now() - this.t0, ...(extra || {}) }) + "\n",
      );
      return;
    }
    const c = this.color ? COLORS[level] : "";
    const r = this.color ? "\x1b[0m" : "";
    const det = extra && Object.keys(extra).length ? " " + JSON.stringify(extra) : "";
    process.stderr.write(`${c}${ts} ${LEVEL_TAG[level]} [${tag}]${r} ${msg}${det}\n`);
  },
  error(tag, msg, extra) { this.write("error", tag, msg, extra); },
  warn(tag, msg, extra) { this.write("warn", tag, msg, extra); },
  info(tag, msg, extra) { this.write("info", tag, msg, extra); },
  debug(tag, msg, extra) { this.write("debug", tag, msg, extra); },
  trace(tag, msg, extra) { this.write("trace", tag, msg, extra); },
};

// ------------------------------------------------------- environment / config
// Config files are plain KEY=value env files, loaded lowest → highest priority.
// Anything already exported in the real environment always wins.
const ENV_FILES = [
  "/etc/idaroom/idaroom.env",
  path.join(process.env.HOME || "/root", ".config/idaroom/idaroom.env"),
  process.env.IDAROOM_CONFIG || "",
].filter(Boolean);

const loadedEnvFiles = [];
function loadEnvFiles() {
  const fs = require("fs");
  for (const file of ENV_FILES) {
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    let count = 0;
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim().replace(/^export\s+/, "");
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
        count++;
      }
    }
    loadedEnvFiles.push({ file, applied: count });
  }
}
loadEnvFiles();

const truthy = (v) => v !== undefined && ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
const envInt = (v, fallback) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// ---------------------------------------------------------------- CLI parsing
function parseArgs(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith("--remote-") && a !== ".");
  const opts = {
    command: process.env.IDAROOM_COMMAND && KNOWN_COMMANDS.includes(process.env.IDAROOM_COMMAND)
      ? process.env.IDAROOM_COMMAND
      : "open",
    page: process.env.IDAROOM_PAGE || "/",
    kiosk: truthy(process.env.IDAROOM_KIOSK),
    fullscreen: truthy(process.env.IDAROOM_FULLSCREEN),
    minimized: truthy(process.env.IDAROOM_MINIMIZED),
    devtools: truthy(process.env.IDAROOM_DEVTOOLS),
    json: truthy(process.env.IDAROOM_JSON),
    quiet: truthy(process.env.IDAROOM_QUIET),
    verbose: envInt(process.env.IDAROOM_VERBOSE, 0),
    timeoutMs: envInt(process.env.IDAROOM_TIMEOUT, 10000),
    logLevel: process.env.IDAROOM_LOG_LEVEL || null,
    noColor: !!process.env.NO_COLOR || truthy(process.env.IDAROOM_NO_COLOR),
    fix: truthy(process.env.IDAROOM_FIX),
    dryRun: false,
    unknownCommand: null,
    unknownOption: null,
    url: process.env.IDAROOM_URL || APP_URL,
  };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--kiosk") opts.kiosk = true;
    else if (a === "--fullscreen" || a === "-f") opts.fullscreen = true;
    else if (a === "--minimized") opts.minimized = true;
    else if (a === "--devtools") opts.devtools = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--quiet" || a === "-q") opts.quiet = true;
    else if (a === "--verbose" || a === "-V") opts.verbose += 1;
    else if (a === "-vv") opts.verbose += 2;
    else if (a === "--no-color") opts.noColor = true;
    else if (a === "--fix") opts.fix = true;
    else if (a === "--dry-run" || a === "-n") opts.dryRun = true;
    else if (a === "--log-level") opts.logLevel = args[++i] || "info";
    else if (a.startsWith("--log-level=")) opts.logLevel = a.slice("--log-level=".length);
    else if (a === "--timeout") opts.timeoutMs = envInt(args[++i], opts.timeoutMs);
    else if (a.startsWith("--timeout=")) opts.timeoutMs = envInt(a.slice("--timeout=".length), opts.timeoutMs);
    else if (a === "--page" || a === "-p") opts.page = args[++i] || "/";
    else if (a === "--url") opts.url = args[++i] || APP_URL;
    else if (a === "--version" || a === "-v") opts.command = "version";
    else if (a === "--help" || a === "-h") opts.command = "help";
    else if (a.startsWith("-")) opts.unknownOption = a;
    else positional.push(a);
  }
  if (positional.length) {
    const [cmd, ...rest] = positional;
    if (KNOWN_COMMANDS.includes(cmd)) {
      opts.command = cmd;
      if (cmd === "open" && rest[0]) opts.page = rest[0];
      if ((cmd === "url" || cmd === "browser") && rest[0]) opts.page = rest[0];
      if (cmd === "url" && rest[0] && /^https?:/i.test(rest[0])) opts.url = rest[0];
    } else if (cmd.startsWith("/")) {
      opts.page = cmd;
    } else {
      opts.unknownCommand = cmd;
      opts.command = "help";
    }
  }
  // Resolve the effective log level: --quiet < default < --verbose < --log-level
  if (!opts.logLevel || !(opts.logLevel in LEVELS)) {
    const invalid = opts.logLevel && !(opts.logLevel in LEVELS) ? opts.logLevel : null;
    opts.invalidLogLevel = invalid;
    opts.logLevel = opts.quiet ? "error" : opts.verbose >= 2 ? "trace" : opts.verbose === 1 ? "debug" : "warn";
  }
  if (opts.command === "settings") opts.page = "/dashboard/settings";
  if (opts.command === "console") opts.page = "/dashboard/console";
  if (opts.command === "dashboard") opts.page = "/dashboard";
  if (!opts.page.startsWith("/")) opts.page = "/" + opts.page;
  return opts;
}



const HELP = `IDAROOM v${APP_VERSION} — تطبيق سطح المكتب / أداة سطر الأوامر

الاستعمال:
  idaroom [command] [options]

أوامر النافذة (تفتح التطبيق):
  open [path]        فتح التطبيق على صفحة محددة (افتراضي /)
  dashboard          فتح لوحة التحكم
  console            فتح الطرفية داخل التطبيق
  settings           فتح صفحة الإعدادات والتحديثات
  browser [path]     فتح الصفحة في متصفح النظام بدل نافذة التطبيق

أوامر الطرفية (بدون نافذة):
  status             حالة الخدمة والإصدار والاتصال
  health             فحص سريع — يخرج بالرمز 0 إذا كل شيء سليم
  info               معلومات التطبيق ومسار التثبيت
  routes             قائمة صفحات التطبيق
  config             العنوان المستعمل ومتغيّرات البيئة
  ping               قياس زمن استجابة الخادم
  doctor             فحص شامل للتبعيات والإعدادات وsystemd والبيئة
  doctor --fix       إصلاح تلقائي للمشكلات الشائعة (أضف --dry-run للمعاينة)
  version            عرض رقم الإصدار
  help               عرض هذه المساعدة

الخيارات:
  -p, --page <path>  الصفحة المطلوبة
      --url <url>    استخدام عنوان خادم آخر
  -f, --fullscreen   وضع ملء الشاشة
      --kiosk        وضع الكشك (بدون إطار/خروج)
      --minimized    البدء مصغّراً
      --devtools     فتح أدوات المطوّر
      --json         إخراج بصيغة JSON (للسكربتات) — يشمل سجلات JSON على stderr
  -q, --quiet        كتم السجلات (أخطاء فقط)
  -V, --verbose      سجلات تشخيصية (كرّرها -V -V أو -vv لأقصى تفصيل)
      --log-level <lvl>  silent|error|warn|info|debug|trace
      --timeout <ms> مهلة الاتصال بالمللي ثانية (افتراضي 10000)
      --no-color     تعطيل الألوان في السجلات
      --fix          (doctor) إصلاح المشكلات القابلة للإصلاح تلقائياً
  -n, --dry-run      (doctor) عرض الإصلاحات دون تنفيذها
  -v, --version      عرض رقم الإصدار
  -h, --help         عرض المساعدة

رموز الخروج:
  0  نجاح
  1  الخدمة متاحة لكن بها خلل (health/status)
  2  تعذّر الاتصال بالخادم (شبكة/DNS/مهلة)
  3  أمر أو خيار غير معروف
  4  رد الخادم غير صالح
  5  خطأ داخلي غير متوقّع
  6  إصلاحات معلّقة تحتاج صلاحيات الجذر (doctor --fix)
  7  تعذّر تنفيذ أحد الإصلاحات (doctor --fix)

ملفات الإعداد (KEY=value، الأولوية تصاعدياً، والبيئة الحقيقية تسبقها):
  /etc/idaroom/idaroom.env
  ~/.config/idaroom/idaroom.env
  $IDAROOM_CONFIG

متغيّرات البيئة:
  IDAROOM_URL         عنوان الخادم الافتراضي
  IDAROOM_LOG_LEVEL   مستوى السجلات الافتراضي
  IDAROOM_VERBOSE     عدد مستويات التفصيل (1 = debug، 2 = trace)
  IDAROOM_QUIET       1 لكتم المخرجات
  IDAROOM_JSON        1 لإخراج JSON دائماً
  IDAROOM_NO_COLOR    1 لتعطيل الألوان
  IDAROOM_TIMEOUT     مهلة الاتصال بالمللي ثانية
  IDAROOM_COMMAND     الأمر الافتراضي (مفيد لخدمات systemd)
  IDAROOM_PAGE        الصفحة الافتراضية عند فتح النافذة
  IDAROOM_KIOSK / IDAROOM_FULLSCREEN / IDAROOM_MINIMIZED / IDAROOM_DEVTOOLS
  IDAROOM_CONFIG      مسار ملف إعداد إضافي
  NO_COLOR            تعطيل الألوان

systemd:
  systemctl --user enable --now idaroom.service        # التطبيق عند الدخول
  sudo systemctl enable --now idaroom-health.timer     # فحص دوري للصحة
  الإعدادات تُقرأ من /etc/idaroom/idaroom.env

أمثلة:
  idaroom dashboard
  idaroom status --json | jq .version
  idaroom health && echo "OK"
  idaroom health -V            # تشخيص مفصّل على stderr
  idaroom status --json -V 2> idaroom.log
  IDAROOM_LOG_LEVEL=debug idaroom health
  idaroom open /dashboard/students --fullscreen
  idaroom --url http://localhost:8080 console
`;



const ROUTES = [
  "/",
  "/about",
  "/login",
  "/dashboard",
  "/dashboard/students",
  "/dashboard/attendance",
  "/dashboard/exams",
  "/dashboard/behavior",
  "/dashboard/cards",
  "/dashboard/gate",
  "/dashboard/gate-log",
  "/dashboard/notifications",
  "/dashboard/library",
  "/dashboard/trips",
  "/dashboard/decisions",
  "/dashboard/guidance",
  "/dashboard/import",
  "/dashboard/console",
  "/dashboard/diagnostics",
  "/dashboard/settings",
  "/dashboard/profile",
];

function out(text) {
  process.stdout.write(text.endsWith("\n") ? text : text + "\n");
}

class CliError extends Error {
  constructor(code, message, extra) {
    super(message);
    this.code = code;
    this.extra = extra || {};
  }
}

async function fetchStatus(baseUrl, timeoutMs = 10000) {
  const endpoint = new URL("/api/public/cli", baseUrl).toString();
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  logger.debug("net", "GET " + endpoint, { timeoutMs });
  let res;
  try {
    res = await fetch(endpoint, { headers: { accept: "application/json" }, signal: ctrl.signal });
  } catch (e) {
    const aborted = e && (e.name === "AbortError" || ctrl.signal.aborted);
    logger.error("net", aborted ? "request timed out" : "request failed", {
      endpoint,
      cause: e instanceof Error ? e.message : String(e),
    });
    throw new CliError(EXIT.NETWORK, aborted ? `انتهت المهلة بعد ${timeoutMs}ms` : e instanceof Error ? e.message : String(e), {
      endpoint,
    });
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - started;
  logger.debug("net", "response received", { status: res.status, latencyMs });
  if (!res.ok) {
    logger.error("net", "server returned an error status", { status: res.status });
    throw new CliError(EXIT.PROTOCOL, `الخادم أرجع الحالة ${res.status}`, { endpoint, status: res.status });
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    logger.error("parse", "invalid JSON payload", { cause: e instanceof Error ? e.message : String(e) });
    throw new CliError(EXIT.PROTOCOL, "رد الخادم ليس JSON صالحاً", { endpoint });
  }
  if (!data || typeof data !== "object" || !data.services) {
    logger.error("parse", "payload missing expected fields", { keys: data ? Object.keys(data) : [] });
    throw new CliError(EXIT.PROTOCOL, "رد الخادم ناقص الحقول المتوقّعة", { endpoint });
  }
  logger.trace("net", "payload", { data });
  return { ...data, latencyMs };
}

// ------------------------------------------------------------- doctor --fix
// Automatic remediation for the common local problems `doctor` detects.
// Every action is idempotent, reports what it did, and never touches user
// content: existing configuration files are preserved as-is.
const DEFAULT_ENV_TEMPLATE = `# IDAROOM — إعدادات سطر الأوامر والخدمة
# أُنشئ تلقائياً بواسطة: idaroom doctor --fix
# أي متغيّر مُصدَّر في البيئة الحقيقية له الأولوية على هذا الملف.

IDAROOM_URL=${DEFAULT_URL}
IDAROOM_LOG_LEVEL=info
IDAROOM_NO_COLOR=1
IDAROOM_TIMEOUT=10000
#IDAROOM_JSON=1
#IDAROOM_QUIET=1
#IDAROOM_COMMAND=dashboard
#IDAROOM_PAGE=/dashboard
`;

function resourcePath(...parts) {
  const base = process.resourcesPath || path.join(app.getAppPath(), "..");
  return path.join(base, ...parts);
}

// Returns { actions, needRoot } — actions: {name, status, detail}
// status: applied | skipped | failed | dry
async function applyFixes(opts) {
  const fs = require("fs");
  const actions = [];
  const dry = !!opts.dryRun;
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  let needRoot = 0;
  const exists = (f) => { try { return fs.existsSync(f); } catch { return false; } };
  const record = (name, status, detail) => {
    actions.push({ name, status, detail: detail || "" });
    logger.debug("fix", name, { status, detail });
  };
  const attempt = (name, detail, fn) => {
    if (dry) return record(name, "dry", detail);
    try {
      fn();
      record(name, "applied", detail);
    } catch (e) {
      record(name, "failed", `${detail} — ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const rootOnly = (name, detail) => {
    needRoot++;
    record(name, "skipped", `${detail} — يتطلّب صلاحيات الجذر (sudo)`);
  };

  // 1. Data + log directories
  const userData = app.getPath("userData");
  const logsDir = path.join(userData, "logs");
  for (const dir of [userData, logsDir]) {
    if (exists(dir)) {
      let ok = true;
      try { fs.accessSync(dir, fs.constants.W_OK); } catch { ok = false; }
      if (!ok) attempt("إصلاح أذونات المجلد", dir, () => fs.chmodSync(dir, 0o700));
      continue;
    }
    attempt("إنشاء المجلد", dir, () => fs.mkdirSync(dir, { recursive: true, mode: 0o700 }));
  }

  // 2. User configuration file
  const userEnv = path.join(process.env.HOME || "/root", ".config/idaroom/idaroom.env");
  if (!exists(userEnv)) {
    attempt("إنشاء ملف الإعداد للمستخدم", userEnv, () => {
      fs.mkdirSync(path.dirname(userEnv), { recursive: true, mode: 0o755 });
      fs.writeFileSync(userEnv, DEFAULT_ENV_TEMPLATE, { mode: 0o644 });
    });
  }

  // 3. System configuration file
  const sysEnv = "/etc/idaroom/idaroom.env";
  if (!exists(sysEnv) && process.platform === "linux") {
    if (isRoot) {
      const template = exists(resourcePath("systemd", "idaroom.env"))
        ? fs.readFileSync(resourcePath("systemd", "idaroom.env"), "utf8")
        : DEFAULT_ENV_TEMPLATE;
      attempt("إنشاء ملف الإعداد العام", sysEnv, () => {
        fs.mkdirSync("/etc/idaroom", { recursive: true, mode: 0o755 });
        fs.writeFileSync(sysEnv, template, { mode: 0o644 });
      });
    } else {
      rootOnly("إنشاء ملف الإعداد العام", sysEnv);
    }
  }

  // 4. Unreadable configuration files → chmod 644 when we may
  for (const f of ENV_FILES) {
    if (!exists(f)) continue;
    let readable = true;
    try { fs.accessSync(f, fs.constants.R_OK); } catch { readable = false; }
    if (readable) continue;
    let owned = false;
    try { owned = isRoot || fs.statSync(f).uid === process.getuid(); } catch {}
    if (owned) attempt("إصلاح أذونات ملف الإعداد", f, () => fs.chmodSync(f, 0o644));
    else rootOnly("إصلاح أذونات ملف الإعداد", f);
  }

  if (process.platform !== "linux") return { actions, needRoot };

  // 5. chrome-sandbox SUID bit
  const sandbox = path.join(path.dirname(process.execPath), "chrome-sandbox");
  if (exists(sandbox)) {
    let mode = 0;
    try { mode = fs.statSync(sandbox).mode & 0o7777; } catch {}
    if ((mode & 0o4000) === 0) {
      if (isRoot) attempt("ضبط SUID على chrome-sandbox", sandbox, () => fs.chmodSync(sandbox, 0o4755));
      else rootOnly("ضبط SUID على chrome-sandbox", sandbox);
    }
  }

  // 6. /usr/bin/idaroom launcher symlink
  const binTargets = ["/opt/IDAROOM/idaroom", "/usr/lib/idaroom/idaroom"];
  const binTarget = binTargets.find(exists);
  if (binTarget && !exists("/usr/bin/idaroom")) {
    if (isRoot) attempt("ربط الأمر /usr/bin/idaroom", binTarget, () => fs.symlinkSync(binTarget, "/usr/bin/idaroom"));
    else rootOnly("ربط الأمر /usr/bin/idaroom", binTarget);
  }

  // 7. bash completion
  const compSrc = resourcePath("idaroom-completion.bash");
  const compDst = "/usr/share/bash-completion/completions/idaroom";
  if (exists(compSrc) && !exists(compDst)) {
    if (isRoot) {
      attempt("تثبيت الإكمال التلقائي", compDst, () => {
        fs.mkdirSync(path.dirname(compDst), { recursive: true });
        fs.copyFileSync(compSrc, compDst);
        fs.chmodSync(compDst, 0o644);
      });
    } else rootOnly("تثبيت الإكمال التلقائي", compDst);
  }

  // 8. systemd units
  const units = [
    { src: resourcePath("systemd", "idaroom.service"), dst: "/usr/lib/systemd/user/idaroom.service" },
    { src: resourcePath("systemd", "idaroom-health.service"), dst: "/usr/lib/systemd/system/idaroom-health.service" },
    { src: resourcePath("systemd", "idaroom-health.timer"), dst: "/usr/lib/systemd/system/idaroom-health.timer" },
  ];
  let installedUnit = false;
  for (const u of units) {
    if (!exists(u.src) || exists(u.dst)) continue;
    if (!isRoot) { rootOnly("تثبيت وحدة systemd", u.dst); continue; }
    const before = actions.length;
    attempt("تثبيت وحدة systemd", u.dst, () => {
      fs.mkdirSync(path.dirname(u.dst), { recursive: true });
      fs.copyFileSync(u.src, u.dst);
      fs.chmodSync(u.dst, 0o644);
    });
    if (actions[before] && actions[before].status === "applied") installedUnit = true;
  }
  if (installedUnit && !dry) {
    try {
      require("child_process").execFileSync("systemctl", ["daemon-reload"], { stdio: "ignore" });
      record("إعادة تحميل systemd", "applied", "systemctl daemon-reload");
    } catch (e) {
      record("إعادة تحميل systemd", "failed", e instanceof Error ? e.message : String(e));
    }
  }

  return { actions, needRoot };
}

// ----------------------------------------------------------------- doctor
// `idaroom doctor` audits the local installation: runtime dependencies,
// resolved configuration, environment variables, systemd units and the
// server connection. Exit codes follow the same contract as the other
// commands (0 healthy · 1 a check failed · 2 network · 4 bad payload).
const DOCTOR_ENV_RULES = {
  IDAROOM_URL: (v) => (/^https?:\/\//i.test(v) ? null : "يجب أن يبدأ بـ http:// أو https://"),
  IDAROOM_LOG_LEVEL: (v) => (v in LEVELS ? null : `قيمة غير صالحة (المسموح: ${Object.keys(LEVELS).join("|")})`),
  IDAROOM_TIMEOUT: (v) => (Number.parseInt(v, 10) > 0 ? null : "يجب أن يكون عدداً صحيحاً موجباً"),
  IDAROOM_VERBOSE: (v) => (Number.parseInt(v, 10) >= 0 ? null : "يجب أن يكون 0 أو 1 أو 2"),
  IDAROOM_COMMAND: (v) => (KNOWN_COMMANDS.includes(v) ? null : "أمر غير معروف"),
  IDAROOM_PAGE: (v) => (v.startsWith("/") ? null : "يجب أن يبدأ بـ /"),
  IDAROOM_CONFIG: (v) => (require("fs").existsSync(v) ? null : "الملف غير موجود"),
};

async function runDoctor(opts) {
  const fs = require("fs");
  const checks = [];
  // --fix repairs first, then the audit reports the post-repair state.
  let fixResult = null;
  if (opts.fix || opts.dryRun) {
    logger.info("doctor", "running repairs", { dryRun: !!opts.dryRun });
    fixResult = await applyFixes(opts);
    if (!opts.dryRun) {
      loadedEnvFiles.length = 0;
      loadEnvFiles();
    }
  }
  const add = (group, name, status, detail, hint) =>
    checks.push({ group, name, status, detail: detail || "", ...(hint ? { hint } : {}) });
  const exists = (f) => { try { return fs.existsSync(f); } catch { return false; } };

  // 1. Runtime dependencies
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  add("runtime", "Electron", process.versions.electron ? "pass" : "fail", `v${process.versions.electron || "?"}`);
  add("runtime", "Node.js", nodeMajor >= 18 ? "pass" : "fail", `v${process.versions.node}`,
    nodeMajor >= 18 ? undefined : "مطلوب Node 18+ لدعم fetch");
  add("runtime", "fetch API", typeof fetch === "function" ? "pass" : "fail", typeof fetch);
  add("runtime", "المنصّة", "pass", `${process.platform}-${process.arch}`);
  const appPath = app.getAppPath();
  add("runtime", "مسار التثبيت", exists(appPath) ? "pass" : "fail", appPath);
  const userData = app.getPath("userData");
  let writable = false;
  try { fs.mkdirSync(userData, { recursive: true }); fs.accessSync(userData, fs.constants.W_OK); writable = true; } catch {}
  add("runtime", "مجلد البيانات قابل للكتابة", writable ? "pass" : "fail", userData);

  if (process.platform === "linux") {
    const sandbox = path.join(path.dirname(process.execPath), "chrome-sandbox");
    if (exists(sandbox)) {
      let mode = 0;
      try { mode = fs.statSync(sandbox).mode & 0o7777; } catch {}
      const suid = (mode & 0o4000) !== 0;
      add("runtime", "chrome-sandbox", suid ? "pass" : "warn", `الصلاحيات ${mode.toString(8)}`,
        suid ? undefined : "نفّذ: sudo chmod 4755 " + sandbox);
    } else {
      add("runtime", "chrome-sandbox", "warn", "غير موجود", "طبيعي في النسخة المحمولة/AppImage");
    }
    const displayed = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
    add("runtime", "خادم العرض", displayed ? "pass" : "warn",
      process.env.WAYLAND_DISPLAY ? "Wayland" : process.env.DISPLAY || "غير متوفّر",
      displayed ? undefined : "أوامر الطرفية تعمل، لكن فتح النافذة يحتاج جلسة رسومية");
  }

  // 2. Configuration files
  for (const f of ENV_FILES) {
    const loaded = loadedEnvFiles.find((l) => l.file === f);
    if (!exists(f)) {
      add("config", f, f === "/etc/idaroom/idaroom.env" ? "warn" : "skip", "غير موجود",
        f === "/etc/idaroom/idaroom.env" ? "يُنشأ تلقائياً عند تثبيت حزمة .deb" : undefined);
      continue;
    }
    let readable = true;
    try { fs.accessSync(f, fs.constants.R_OK); } catch { readable = false; }
    add("config", f, readable ? "pass" : "fail",
      readable ? `${loaded?.applied ?? 0} متغيّر مُطبَّق` : "لا يمكن قراءته",
      readable ? undefined : "تحقّق من الصلاحيات: sudo chmod 644 " + f);
  }

  // 3. Environment variables
  let envIssues = 0;
  for (const [key, validate] of Object.entries(DOCTOR_ENV_RULES)) {
    const v = process.env[key];
    if (v === undefined || v === "") { add("env", key, "skip", "(غير مضبوط)"); continue; }
    const problem = validate(v);
    if (problem) envIssues++;
    add("env", key, problem ? "fail" : "pass", problem ? `${v} — ${problem}` : v);
  }
  if (opts.invalidLogLevel) add("env", "--log-level", "warn", `قيمة غير معروفة: ${opts.invalidLogLevel}`);

  // 4. systemd integration (Linux only)
  if (process.platform === "linux") {
    const units = [
      { file: "/usr/lib/systemd/user/idaroom.service", label: "idaroom.service" },
      { file: "/usr/lib/systemd/system/idaroom-health.service", label: "idaroom-health.service" },
      { file: "/usr/lib/systemd/system/idaroom-health.timer", label: "idaroom-health.timer" },
    ];
    const anyUnit = units.some((u) => exists(u.file));
    for (const u of units) {
      add("systemd", u.label, exists(u.file) ? "pass" : anyUnit ? "fail" : "skip",
        exists(u.file) ? u.file : "غير مثبّت",
        exists(u.file) ? undefined : "تُثبَّت مع حزمة .deb");
    }
    add("systemd", "أمر systemctl", exists("/usr/bin/systemctl") || exists("/bin/systemctl") ? "pass" : "skip",
      exists("/usr/bin/systemctl") || exists("/bin/systemctl") ? "متوفّر" : "النظام لا يستعمل systemd");
    add("systemd", "الرابط /usr/bin/idaroom", exists("/usr/bin/idaroom") ? "pass" : "skip",
      exists("/usr/bin/idaroom") ? "مثبّت" : "غير مثبّت (تشغيل محمول)");
    const comp = "/usr/share/bash-completion/completions/idaroom";
    add("systemd", "الإكمال التلقائي", exists(comp) ? "pass" : "skip", exists(comp) ? comp : "غير مثبّت");
  }

  // 5. Server connectivity
  let networkCode = EXIT.OK;
  try {
    const s = await fetchStatus(opts.url, opts.timeoutMs);
    add("server", "الاتصال", "pass", `${opts.url} — ${s.latencyMs} ms`);
    add("server", "خدمة الويب", s.services.web ? "pass" : "fail", s.services.web ? "OK" : "غير متاحة");
    add("server", "خدمة الخادم", s.services.backend ? "pass" : "fail", s.services.backend ? "OK" : "غير متاحة");
    const sameVersion = String(s.version) === APP_VERSION;
    add("server", "توافق الإصدار", sameVersion ? "pass" : "warn",
      `العميل v${APP_VERSION} · الخادم v${s.version}`,
      sameVersion ? undefined : "حدّث تطبيق سطح المكتب من صفحة الإعدادات");
  } catch (e) {
    const code = e instanceof CliError ? e.code : EXIT.INTERNAL;
    networkCode = code;
    add("server", "الاتصال", "fail", `${opts.url} — ${e instanceof Error ? e.message : String(e)}`,
      code === EXIT.NETWORK ? "تحقّق من الشبكة أو من IDAROOM_URL" : undefined);
  }

  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const c of checks) counts[c.status]++;
  const fixActions = fixResult ? fixResult.actions : [];
  const fixCounts = { applied: 0, skipped: 0, failed: 0, dry: 0 };
  for (const a of fixActions) fixCounts[a.status]++;

  // Exit codes, most specific first.
  let exitCode = EXIT.OK;
  if (counts.fail) exitCode = networkCode !== EXIT.OK ? networkCode : EXIT.UNHEALTHY;
  else if (fixCounts.failed) exitCode = EXIT.FIXFAILED;
  else if (fixResult && fixResult.needRoot) exitCode = EXIT.NEEDROOT;

  if (opts.json) {
    out(JSON.stringify({
      ok: exitCode === EXIT.OK,
      exitCode,
      summary: counts,
      ...(fixResult ? { fix: { mode: opts.dryRun ? "dry-run" : "apply", summary: fixCounts, needRoot: fixResult.needRoot, actions: fixActions } } : {}),
      checks,
    }, null, 2));
  } else if (!opts.quiet) {
    const icon = { pass: "✔", warn: "!", fail: "✖", skip: "-" };
    const titles = { runtime: "التبعيات والبيئة التشغيلية", config: "ملفات الإعداد", env: "متغيّرات البيئة", systemd: "تكامل systemd", server: "الخادم" };
    const lines = [`IDAROOM doctor — v${APP_VERSION}`];
    for (const g of ["runtime", "config", "env", "systemd", "server"]) {
      const items = checks.filter((c) => c.group === g);
      if (!items.length) continue;
      lines.push("", titles[g] + ":");
      for (const c of items) {
        lines.push(`  ${icon[c.status]} ${c.name}${c.detail ? " — " + c.detail : ""}`);
        if (c.hint) lines.push(`      ↳ ${c.hint}`);
      }
    }
    if (fixResult) {
      const fixIcon = { applied: "✔", skipped: "!", failed: "✖", dry: "→" };
      lines.push("", opts.dryRun ? "الإصلاحات المقترحة (--dry-run، لم يُنفَّذ شيء):" : "الإصلاحات المنفَّذة (--fix):");
      if (!fixActions.length) lines.push("  ✔ لا شيء يحتاج إصلاحاً");
      for (const a of fixActions) lines.push(`  ${fixIcon[a.status]} ${a.name}${a.detail ? " — " + a.detail : ""}`);
      if (fixResult.needRoot) lines.push("      ↳ أعد التنفيذ بصلاحيات الجذر: sudo idaroom doctor --fix");
    }
    lines.push("", `النتيجة: ${counts.pass} ناجح · ${counts.warn} تنبيه · ${counts.fail} فاشل · ${counts.skip} متجاوَز (رمز الخروج ${exitCode})`);
    if (fixResult) {
      lines.push(`الإصلاح: ${fixCounts.applied} مطبَّق · ${fixCounts.dry} مقترح · ${fixCounts.skipped} متروك · ${fixCounts.failed} فاشل`);
    }
    out(lines.join("\n"));
  }
  logger.info("doctor", "audit finished", { ...counts, ...(fixResult ? { fixApplied: fixCounts.applied, fixFailed: fixCounts.failed } : {}), exitCode });
  return exitCode;
}

// Returns the process exit code.
async function runHeadless(opts) {
  const cmd = opts.command;
  logger.info("cli", "running command", { command: cmd, url: opts.url, logLevel: opts.logLevel });
  if (opts.invalidLogLevel) {
    logger.warn("cli", "unknown log level, falling back", { given: opts.invalidLogLevel, using: opts.logLevel });
  }
  if (opts.unknownOption) {
    logger.error("cli", "unknown option", { option: opts.unknownOption });
    process.stderr.write(`idaroom: خيار غير معروف: ${opts.unknownOption} — جرّب: idaroom --help\n`);
    return EXIT.USAGE;
  }
  if (opts.unknownCommand) {
    logger.error("cli", "unknown command", { command: opts.unknownCommand });
    process.stderr.write(`idaroom: أمر غير معروف: ${opts.unknownCommand} — جرّب: idaroom --help\n`);
    return EXIT.USAGE;
  }



  if (cmd === "help") {
    out(HELP);
    return 0;
  }
  if (cmd === "version") {
    out(opts.json ? JSON.stringify({ version: APP_VERSION }) : `IDAROOM v${APP_VERSION}`);
    return 0;
  }
  if (cmd === "routes") {
    out(opts.json ? JSON.stringify(ROUTES) : ROUTES.join("\n"));
    return 0;
  }
  if (cmd === "info") {
    const info = {
      name: "IDAROOM",
      version: APP_VERSION,
      electron: process.versions.electron,
      node: process.versions.node,
      platform: `${process.platform}-${process.arch}`,
      installPath: app.getAppPath(),
      configPath: app.getPath("userData"),
      url: opts.url,
    };
    out(
      opts.json
        ? JSON.stringify(info, null, 2)
        : Object.entries(info)
            .map(([k, v]) => `${k.padEnd(12)} ${v}`)
            .join("\n"),
    );
    return 0;
  }
  if (cmd === "config") {
    const envKeys = [
      "IDAROOM_URL", "IDAROOM_LOG_LEVEL", "IDAROOM_VERBOSE", "IDAROOM_QUIET", "IDAROOM_JSON",
      "IDAROOM_NO_COLOR", "IDAROOM_TIMEOUT", "IDAROOM_PAGE", "IDAROOM_COMMAND",
      "IDAROOM_KIOSK", "IDAROOM_FULLSCREEN", "IDAROOM_MINIMIZED", "IDAROOM_DEVTOOLS",
      "IDAROOM_CONFIG", "NO_COLOR",
    ];
    const env = Object.fromEntries(envKeys.map((k) => [k, process.env[k] ?? null]));
    const cfg = {
      resolved: {
        url: opts.url,
        logLevel: opts.logLevel,
        json: opts.json,
        quiet: opts.quiet,
        verbose: opts.verbose,
        timeoutMs: opts.timeoutMs,
        page: opts.page,
        noColor: opts.noColor,
      },
      env,
      configFiles: ENV_FILES.map((f) => ({
        file: f,
        loaded: loadedEnvFiles.some((l) => l.file === f),
        applied: loadedEnvFiles.find((l) => l.file === f)?.applied ?? 0,
      })),
      userData: app.getPath("userData"),
    };
    if (opts.json) {
      out(JSON.stringify(cfg, null, 2));
    } else {
      const lines = [
        "الإعدادات الفعّالة:",
        ...Object.entries(cfg.resolved).map(([k, v]) => `  ${k.padEnd(12)} ${v}`),
        "",
        "متغيّرات البيئة:",
        ...envKeys.map((k) => `  ${k.padEnd(20)} ${env[k] ?? "(غير مضبوط)"}`),
        "",
        "ملفات الإعداد:",
        ...cfg.configFiles.map((f) => `  ${f.loaded ? "✔" : "✖"} ${f.file}${f.loaded ? ` (${f.applied} متغيّر)` : ""}`),
        "",
        `userData             ${cfg.userData}`,
      ];
      out(lines.join("\n"));
    }
    return 0;
  }


  if (cmd === "doctor") return await runDoctor(opts);

  // Network-backed commands
  try {
    const s = await fetchStatus(opts.url, opts.timeoutMs);
    logger.info("net", "server reachable", { latencyMs: s.latencyMs, healthy: !!s.healthy });
    if (cmd === "ping") {
      out(opts.json ? JSON.stringify({ url: opts.url, latencyMs: s.latencyMs, ok: true }) : `${opts.url} — ${s.latencyMs} ms`);
      return EXIT.OK;
    }
    if (cmd === "health") {
      if (!s.services.web) logger.error("health", "web service is down");
      if (!s.services.backend) logger.error("health", "backend service is down");
      if (!opts.quiet) {
        out(
          opts.json
            ? JSON.stringify({ healthy: s.healthy, services: s.services })
            : `web: ${s.services.web ? "OK" : "FAIL"} · backend: ${s.services.backend ? "OK" : "FAIL"}`,
        );
      }
      return s.healthy ? EXIT.OK : EXIT.UNHEALTHY;
    }
    // status
    if (!s.healthy) logger.warn("status", "server reports a degraded state", { services: s.services });
    if (opts.json) {
      out(JSON.stringify({ ...s, client: APP_VERSION }, null, 2));
    } else if (!opts.quiet) {
      out(
        [
          `IDAROOM v${APP_VERSION} (client) · v${s.version} (server)`,
          `العنوان   ${s.origin}`,
          `الويب     ${s.services.web ? "متصل" : "غير متاح"}`,
          `الخادم    ${s.services.backend ? "متصل" : "غير متاح"}`,
          `الاستجابة ${s.latencyMs} ms`,
          `الإصدار   ${s.releaseDate || "—"}`,
        ].join("\n"),
      );
    }
    return s.healthy ? EXIT.OK : EXIT.UNHEALTHY;
  } catch (e) {
    const code = e instanceof CliError ? e.code : EXIT.INTERNAL;
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("cli", "command failed", { command: cmd, exitCode: code, reason: msg });
    logger.debug("cli", "stack trace", { stack: e instanceof Error ? e.stack : undefined });
    process.stderr.write(
      opts.json
        ? JSON.stringify({ error: msg, exitCode: code, url: opts.url, ...(e instanceof CliError ? e.extra : {}) }) + "\n"
        : `idaroom: تعذّر تنفيذ ${cmd} على ${opts.url} — ${msg} (رمز الخروج ${code})\n`,
    );
    return code;
  }
}


// ------------------------------------------------------------------- windows
let splashWin = null;
let mainWin = null;

function targetUrl(opts) {
  try {
    return new URL(opts.page, opts.url).toString();
  } catch {
    return opts.url;
  }
}

// Desktop update check: compares this build with /version.json on the server.
// Page content always updates by itself (it is loaded from the server);
// this only concerns the desktop shell.
async function checkDesktopUpdate(baseUrl) {
  try {
    const { dialog } = require("electron");
    const res = await fetch(new URL("/version.json?t=" + Date.now(), baseUrl).toString());
    if (!res.ok) return;
    const data = await res.json();
    const cmp = (a, b) => {
      const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
      for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); }
      return 0;
    };
    if (!data.version || cmp(data.version, APP_VERSION) <= 0) return;
    const r = await dialog.showMessageBox(mainWin, {
      type: "info",
      buttons: ["تحميل التحديث", "لاحقاً"],
      defaultId: 0,
      title: "تحديث متوفر",
      message: `يتوفر إصدار جديد v${data.version} (الإصدار الحالي v${APP_VERSION}).`,
      detail: (data.notes || []).join("\n"),
    });
    if (r.response === 0) {
      const url = process.platform === "win32" ? data.windows : data.linux;
      shell.openExternal(url ? new URL(url, baseUrl).toString() : new URL("/download", baseUrl).toString());
    }
  } catch (e) {
    logger.debug("update", "update check failed", { error: String(e) });
  }
}

function createSplash() {
  splashWin = new BrowserWindow({
    width: 520,
    height: 620,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: "#00000000",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splashWin.loadFile(path.join(__dirname, "splash.html"));
}

function createMain(opts) {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 360,
    minHeight: 600,
    show: false,
    kiosk: opts.kiosk,
    fullscreen: opts.fullscreen,
    backgroundColor: "#0f1a14",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    title: `IDAROOM v${APP_VERSION}`,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  mainWin.loadURL(targetUrl(opts));
  let triedLocal = false;
  setTimeout(() => checkDesktopUpdate(opts.url), 8000);

  mainWin.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    logger.error("window", "page failed to load", { errorCode, errorDescription, url: validatedURL });
    if (errorCode === -3) return; // aborted navigation
    const local = LOCAL_URL || process.env.IDAROOM_LOCAL_URL;
    if (local && !triedLocal && !String(validatedURL).startsWith(local)) {
      triedLocal = true;
      logger.warn("window", "online unreachable, switching to local server", { local });
      mainWin.loadURL(targetUrl({ ...opts, url: local }));
    }
  });
  mainWin.webContents.on("render-process-gone", (_e, details) => {
    logger.error("window", "renderer process gone", { reason: details.reason, exitCode: details.exitCode });
  });
  mainWin.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    logger.trace("renderer", message, { level, line, sourceId });
  });



  mainWin.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      if (splashWin && !splashWin.isDestroyed()) splashWin.close();
      splashWin = null;
      if (opts.minimized) mainWin.minimize();
      else mainWin.show();
      if (opts.devtools) mainWin.webContents.openDevTools({ mode: "detach" });
    }, 1600);
  });

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      const same = new URL(opts.url);
      if (target.origin !== same.origin) {
        shell.openExternal(url);
        return { action: "deny" };
      }
    } catch {
      /* ignore */
    }
    return { action: "allow" };
  });

  Menu.setApplicationMenu(null);
}

const cli = parseArgs(process.argv);
if (!["help", "version", "routes"].includes(cli.command)) {
  try {
    const configured = new URL(cli.url);
    if (!["https:", "http:"].includes(configured.protocol)) throw new Error("Invalid protocol");
    app.setPath("userData", path.join(app.getPath("appData"), "IDAROOM", configured.hostname));
  } catch {
    process.stderr.write("اضبط عنوان المؤسسة في deployment.json أو IDAROOM_URL قبل التشغيل.\n");
    app.whenReady().then(() => {
      if (!HEADLESS.has(cli.command)) require("electron").dialog.showErrorBox("عنوان المؤسسة غير مضبوط", "اضبط عنوان المؤسسة في deployment.json أو IDAROOM_URL قبل التشغيل.");
      app.exit(EXIT.USAGE);
    });
    throw new Error("Institution deployment URL is required");
  }
}
logger.configure(cli);
logger.debug("boot", "parsed arguments", {
  command: cli.command,
  page: cli.page,
  url: cli.url,
  json: cli.json,
  quiet: cli.quiet,
  verbose: cli.verbose,
});

process.on("uncaughtException", (e) => {
  logger.error("fatal", "uncaught exception", { reason: e instanceof Error ? e.message : String(e) });
  logger.debug("fatal", "stack trace", { stack: e instanceof Error ? e.stack : undefined });
  process.exitCode = EXIT.INTERNAL;
  app.exit(EXIT.INTERNAL);
});
process.on("unhandledRejection", (e) => {
  logger.error("fatal", "unhandled rejection", { reason: e instanceof Error ? e.message : String(e) });
  app.exit(EXIT.INTERNAL);
});

if (cli.unknownCommand || cli.unknownOption) {
  // Usage errors never open a window, whatever the command was.
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const code = await runHeadless({ ...cli, command: cli.command });
    app.exit(code);
  });
} else if (HEADLESS.has(cli.command)) {
  // Pure command line mode: no window, no single-instance lock, real exit code.
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    let code = EXIT.INTERNAL;
    try {
      code = await runHeadless(cli);
    } catch (e) {
      logger.error("cli", "internal error", { reason: e instanceof Error ? e.message : String(e) });
    }
    logger.info("cli", "exiting", { exitCode: code });
    app.exit(code);
  });
} else if (cli.command === "browser") {
  app.whenReady().then(async () => {
    const url = targetUrl(cli);
    logger.info("browser", "opening in system browser", { url });
    try {
      await shell.openExternal(url);
      app.exit(EXIT.OK);
    } catch (e) {
      logger.error("browser", "failed to open system browser", { reason: e instanceof Error ? e.message : String(e) });
      process.stderr.write(`idaroom: تعذّر فتح المتصفح — ${e instanceof Error ? e.message : String(e)}\n`);
      app.exit(EXIT.INTERNAL);
    }
  });
} else {
  // A second `idaroom ...` invocation controls the already running instance
  // instead of launching a duplicate window.
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    logger.info("app", "another instance is running — forwarding the command");
    app.quit();
  } else {
    app.on("second-instance", (_e, argv) => {
      const next = parseArgs(argv);
      logger.info("app", "second instance command", { command: next.command, page: next.page });
      if (!mainWin || mainWin.isDestroyed()) {
        createMain(next);
        return;
      }
      mainWin.loadURL(targetUrl(next));
      if (next.fullscreen) mainWin.setFullScreen(true);
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    });

    app.whenReady().then(() => {
      logger.info("app", "launching window", { url: targetUrl(cli) });
      createSplash();
      createMain(cli);
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createSplash();
          createMain(cli);
        }
      });
    });

    app.on("window-all-closed", () => {
      logger.info("app", "all windows closed");
      if (process.platform !== "darwin") app.quit();
    });
  }
}


// Keep a reference so bundlers don't tree-shake the import used by future
// shell integrations (`idaroom` completion script generation).
void spawn;
