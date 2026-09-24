# IDAROOM — Linux Desktop (AppImage)

This folder contains an Electron wrapper that opens the published IDAROOM site
(`https://idarroom.lovable.app`) as a native Linux desktop application.

The main web app is a server-rendered TanStack Start app running on Cloudflare
Workers, so it **cannot** be bundled as a fully offline `.AppImage`. The wrapper
instead gives users a real desktop window, icon, launcher entry, and system
integration while pointing to the live app.

## Build the AppImage (on a Linux machine)

Requirements: Node.js 20+, `git`.

```bash
cd electron
cp ../public/icon-512.png icon.png   # or provide any 512×512 PNG named icon.png
npm install
npm run dist:linux
```

The AppImage will be produced in `electron/dist/`:

```
electron/dist/IDAROOM-1.0.0-x64.AppImage
```

Make it executable and run:

```bash
chmod +x IDAROOM-1.0.0-x64.AppImage
./IDAROOM-1.0.0-x64.AppImage
```

## Optional targets

- `npm run dist:linux:all` → also produces `.deb` and `.tar.gz`.
- Point at a different environment: `IDAROOM_URL=https://preview.example.com npm start`.

## Notes

- `electron-builder` needs native tooling (7-zip, fakeroot for `.deb`) that is
  available on standard Linux distributions but not inside the Lovable sandbox,
  so the AppImage is built on the user's machine, not on the Lovable server.
- The wrapper opens external links in the system browser and keeps in-app
  navigation inside the desktop window.

## التحكم عبر سطر الأوامر (CLI)

بعد تثبيت حزمة `.deb`، يتوفّر الأمر `idaroom` في الطرفية:

```bash
idaroom                       # فتح التطبيق
idaroom dashboard             # فتح لوحة التحكم مباشرة
idaroom console               # فتح الطرفية داخل التطبيق
idaroom settings              # صفحة الإصدار والتحديثات
idaroom open /dashboard/students --fullscreen
idaroom --url http://localhost:8080 console
idaroom version | idaroom help
```

نسخة واحدة فقط تعمل في نفس الوقت: تنفيذ `idaroom <command>` مرة أخرى يوجّه
النافذة المفتوحة إلى الصفحة المطلوبة بدل فتح نافذة جديدة.

عند بناء الحزمة، انسخ `electron/idaroom` إلى `usr/bin/idaroom` (وضع صلاحية
التنفيذ 0755) بحيث يشير إلى الملف التنفيذي في `/opt/IDAROOM/idaroom`.

## نفس الأوامر داخل الواجهة

الصفحة `/dashboard/console` تعرض طرفية داخل التطبيق تدعم:
`help, version, changelog, whoami, routes, goto, theme, lang, update, cache,
status, logout, clear`.

## أداة لينكس الحقيقية (headless CLI)

الأوامر التالية **لا تفتح أي نافذة** — تطبع النتيجة في الطرفية وتُرجع رمز خروج
قياسي، فيمكن استعمالها داخل سكربتات bash و cron و systemd:

```bash
idaroom status            # الإصدار + حالة الويب والخادم + زمن الاستجابة
idaroom status --json | jq .version
idaroom health && echo OK # رمز خروج 0 عند السلامة، 1 عند الخلل، 2 عند انقطاع الشبكة
idaroom ping              # قياس زمن الاستجابة
idaroom doctor            # فحص شامل: التبعيات، الإعدادات، متغيّرات البيئة، systemd، الخادم
idaroom doctor --fix      # إصلاح تلقائي للمشكلات الشائعة
sudo idaroom doctor --fix # يشمل /etc و systemd و /usr/bin
idaroom doctor --fix --dry-run   # معاينة الإصلاحات دون تنفيذها
idaroom doctor --json | jq .summary
idaroom info              # الإصدار، Electron/Node، مسار التثبيت والإعدادات
idaroom config            # العنوان المستعمل ومتغيّر IDAROOM_URL
idaroom routes            # كل صفحات التطبيق
idaroom version | idaroom help
```

### `idaroom doctor`

فحص تشخيصي كامل للتثبيت المحلي، مقسّم إلى خمس مجموعات:

| المجموعة | ما يفحصه |
| --- | --- |
| التبعيات | إصدار Electron/Node (18+)، توفّر `fetch`، مسار التثبيت، قابلية الكتابة في مجلد البيانات، صلاحيات `chrome-sandbox` (SUID)، وجود جلسة عرض |
| ملفات الإعداد | وجود وقابلية قراءة `/etc/idaroom/idaroom.env` و`~/.config/idaroom/idaroom.env` و`$IDAROOM_CONFIG` وعدد المتغيّرات المُطبَّقة |
| متغيّرات البيئة | التحقّق من صحة `IDAROOM_URL`, `IDAROOM_LOG_LEVEL`, `IDAROOM_TIMEOUT`, `IDAROOM_VERBOSE`, `IDAROOM_COMMAND`, `IDAROOM_PAGE`, `IDAROOM_CONFIG` |
| systemd | وجود `idaroom.service` و`idaroom-health.service/.timer`، وتوفّر `systemctl`، والرابط `/usr/bin/idaroom`، وملف الإكمال التلقائي |
| الخادم | الاتصال وزمن الاستجابة وحالة الويب/الخادم وتوافق إصدار العميل مع الخادم |

رموز الخروج: `0` كل الفحوص سليمة (التنبيهات لا تُفشل) · `1` فشل فحص محلي ·
`2` تعذّر الوصول إلى الخادم · `4` رد خادم غير صالح · `5` خطأ داخلي ·
`6` إصلاحات معلّقة تحتاج `sudo` · `7` تعذّر تنفيذ أحد الإصلاحات.
يدعم `--json` و`--quiet` و`--timeout` و`-V` مثل بقية الأوامر.

#### الإصلاح التلقائي `--fix`

`idaroom doctor --fix` يصلح المشكلات الشائعة، وكل إجراء **idempotent** ولا
يمسّ أي ملف إعداد موجود:

| الإجراء | يحتاج sudo |
| --- | --- |
| إنشاء مجلد البيانات ومجلد السجلات وإصلاح أذونتهما (`0700`) | لا |
| إنشاء `~/.config/idaroom/idaroom.env` من قالب افتراضي | لا |
| إصلاح أذونات ملف إعداد غير قابل للقراءة يملكه المستخدم (`0644`) | لا |
| إنشاء `/etc/idaroom/idaroom.env` | نعم |
| ضبط بت SUID على `chrome-sandbox` (`4755`) | نعم |
| ربط `/usr/bin/idaroom` بملف التشغيل | نعم |
| تثبيت ملف الإكمال التلقائي | نعم |
| تثبيت وحدات systemd ثم `systemctl daemon-reload` | نعم |

أضف `--dry-run` (أو `-n`) لعرض ما سيُنفَّذ دون تغيير أي شيء، و`--json`
للحصول على الحقل `fix.actions` للسكربتات. يمكن تفعيل الإصلاح دائماً عبر
`IDAROOM_FIX=1`. الإصلاحات التي تحتاج الجذر تُبلَّغ ويُرجَع الرمز `6`.

أوامر النافذة: `open [path]`, `dashboard`, `console`, `settings`,
و`browser [path]` لفتح الصفحة في متصفح النظام.

الإكمال التلقائي (Tab) مثبّت في
`/usr/share/bash-completion/completions/idaroom`، والأمر `idaroom` يُربط إلى
`/usr/bin/idaroom` تلقائياً عند تثبيت حزمة `.deb`.
نفس الأوامر متاحة داخل التطبيق من صفحة **/dashboard/console** (اكتب `cli`).

## الإعداد عبر متغيّرات البيئة

يقرأ `idaroom` ملفات `KEY=value` بالترتيب التالي (الأخير يغلب، والبيئة الحقيقية
تغلب الجميع):

1. `/etc/idaroom/idaroom.env` (يُثبَّت مع حزمة `.deb` — انظر `systemd/idaroom.env`)
2. `~/.config/idaroom/idaroom.env`
3. الملف المشار إليه بـ `$IDAROOM_CONFIG`

| المتغيّر | الوظيفة |
| --- | --- |
| `IDAROOM_URL` | عنوان الخادم |
| `IDAROOM_LOG_LEVEL` | `silent|error|warn|info|debug|trace` (يعادل `--log-level`) |
| `IDAROOM_VERBOSE` | 1 = debug، 2 = trace |
| `IDAROOM_QUIET` | 1 لكتم المخرجات |
| `IDAROOM_JSON` | 1 لإخراج JSON دائماً |
| `IDAROOM_NO_COLOR` / `NO_COLOR` | تعطيل الألوان |
| `IDAROOM_TIMEOUT` | مهلة الاتصال بالمللي ثانية (`--timeout`) |
| `IDAROOM_COMMAND` | الأمر الافتراضي بلا وسائط (مفيد لـ systemd) |
| `IDAROOM_PAGE` | الصفحة الافتراضية عند فتح النافذة |
| `IDAROOM_KIOSK` / `IDAROOM_FULLSCREEN` / `IDAROOM_MINIMIZED` / `IDAROOM_DEVTOOLS` | خيارات النافذة |

`idaroom config` (أو `idaroom config --json`) يعرض القيم الفعّالة، مصدر كل
متغيّر، وأي ملفات إعداد تم تحميلها فعلاً.

```bash
IDAROOM_LOG_LEVEL=debug idaroom health
echo 'IDAROOM_LOG_LEVEL=trace' | sudo tee -a /etc/idaroom/idaroom.env
```

## وحدات systemd

الملفات في `electron/systemd/` وتُنسخ تلقائياً عند تثبيت حزمة `.deb`:

| الملف | الوجهة | الغرض |
| --- | --- | --- |
| `idaroom.service` | `/usr/lib/systemd/user/` | تشغيل واجهة التطبيق مع جلسة المستخدم |
| `idaroom-health.service` | `/usr/lib/systemd/system/` | فحص صحة لمرة واحدة (oneshot) |
| `idaroom-health.timer` | `/usr/lib/systemd/system/` | تشغيل الفحص كل 15 دقيقة |
| `idaroom.env` | `/etc/idaroom/idaroom.env` | الإعدادات الافتراضية (لا يُستبدل عند الترقية) |

```bash
# واجهة التطبيق عند تسجيل الدخول (كشك مثلاً)
systemctl --user enable --now idaroom.service
systemctl --user edit idaroom.service   # Environment=IDAROOM_COMMAND=dashboard

# مراقبة دورية للصحة
sudo systemctl enable --now idaroom-health.timer
systemctl list-timers idaroom-health.timer
journalctl -u idaroom-health -f
sudo systemctl start idaroom-health.service; echo $?   # 0 سليم · 1 خلل · 2 شبكة
```

خدمة الفحص تعمل بصيغة JSON وبدون ألوان لتظهر السجلات منظّمة في `journald`،
وتعمل تحت `DynamicUser` مع تقييد صلاحيات كامل، وخدمة الواجهة لا تُعيد المحاولة
عند رمز الخروج 3 (خطأ استعمال).

للتثبيت اليدوي (بدون `.deb`):

```bash
sudo install -Dm644 electron/systemd/idaroom-health.service /etc/systemd/system/
sudo install -Dm644 electron/systemd/idaroom-health.timer  /etc/systemd/system/
install -Dm644 electron/systemd/idaroom.service ~/.config/systemd/user/
sudo install -Dm644 electron/systemd/idaroom.env /etc/idaroom/idaroom.env
sudo systemctl daemon-reload && systemctl --user daemon-reload
```

