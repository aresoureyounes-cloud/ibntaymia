import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Stethoscope, Play, CheckCircle2, XCircle, MinusCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard/diagnostics")({
  head: () => ({
    meta: [
      { property: "og:title", content: "تقرير فحص النظام — إداروم" },
      {
        property: "og:description",
        content: "تقرير فحص النظام — إداروم: صفحة في منصة إداروم للثانوية الجزائرية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "تقرير فحص النظام — إداروم" },
      {
        name: "description",
        content: "فحص حي لكل ميزات إداروم: القراءة والكتابة والحضور والتصدير والطباعة.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DiagnosticsPage,
});

type Status = "idle" | "running" | "pass" | "fail" | "skip";

type Check = {
  id: string;
  group: string;
  label: string;
  run: () => Promise<string | void>;
};

type Result = { status: Status; detail?: string; ms?: number };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function DiagnosticsPage() {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState(false);
  const [previewEnv, setPreviewEnv] = useState(true);

  useEffect(() => {
    const host = window.location.hostname;
    setPreviewEnv(
      host === "localhost" ||
        host === "127.0.0.1" ||
        host.includes("id-preview") ||
        host.endsWith("-dev.lovable.app"),
    );
  }, []);

  const checks = useMemo<Check[]>(() => {
    const readTable = (table: string, label: string): Check => ({
      id: `read:${table}`,
      group: "القراءة (SELECT)",
      label,
      run: async () => {
        const { count, error } = await supabase
          .from(table as never)
          .select("*", { count: "exact", head: true });
        if (error) throw new Error(error.message);
        return `${count ?? 0} سجل`;
      },
    });

    return [
      // ── Auth ─────────────────────────────────────────────
      {
        id: "auth:session",
        group: "المصادقة",
        label: "وجود جلسة نشطة",
        run: async () => {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw new Error(error.message);
          if (!data.session) throw new Error("لا توجد جلسة — سجّل الدخول أولاً");
          return data.session.user.email ?? data.session.user.id;
        },
      },
      {
        id: "auth:roles",
        group: "المصادقة",
        label: "قراءة أدوار المستخدم",
        run: async () => {
          const { data: u } = await supabase.auth.getUser();
          if (!u.user) throw new Error("لا يوجد مستخدم");
          const { data, error } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", u.user.id);
          if (error) throw new Error(error.message);
          if (!data?.length) throw new Error("لا توجد أدوار مسندة");
          return data.map((r) => r.role).join("، ");
        },
      },
      {
        id: "auth:profile",
        group: "المصادقة",
        label: "قراءة الملف الشخصي",
        run: async () => {
          const { data: u } = await supabase.auth.getUser();
          if (!u.user) throw new Error("لا يوجد مستخدم");
          const { data, error } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", u.user.id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) throw new Error("لا يوجد ملف شخصي مرتبط");
          return data.full_name ?? "بدون اسم";
        },
      },

      // ── Reads ────────────────────────────────────────────
      readTable("students", "التلاميذ"),
      readTable("classes", "الأقسام"),
      readTable("attendance_sessions", "حصص الحضور"),
      readTable("attendance_records", "سجلات الحضور"),
      readTable("rfid_cards", "بطاقات RFID"),
      readTable("card_scans", "مسح البوابة"),
      readTable("behavior_records", "السلوك"),
      readTable("exams", "الامتحانات"),
      readTable("grades", "النقاط"),
      readTable("library_items", "المكتبة"),
      readTable("school_trips", "الخرجات"),
      readTable("school_decisions", "القرارات"),
      readTable("notifications", "الإشعارات"),

      // ── CRUD ─────────────────────────────────────────────
      {
        id: "crud:class",
        group: "CRUD",
        label: "إنشاء/تعديل/حذف قسم",
        run: async () => {
          const name = `فحص-${Date.now()}`;
          const { data: created, error: e1 } = await supabase
            .from("classes")
            .insert({ name, level: "فحص" })
            .select("id")
            .single();
          if (e1) throw new Error(`INSERT: ${e1.message}`);
          const { error: e2 } = await supabase
            .from("classes")
            .update({ branch: "تعديل" })
            .eq("id", created.id);
          if (e2) throw new Error(`UPDATE: ${e2.message}`);
          const { error: e3 } = await supabase.from("classes").delete().eq("id", created.id);
          if (e3) throw new Error(`DELETE: ${e3.message}`);
          return "إنشاء + تعديل + حذف ناجح";
        },
      },
      {
        id: "crud:student",
        group: "CRUD",
        label: "إنشاء/تعديل/حذف تلميذ",
        run: async () => {
          const { data: created, error: e1 } = await supabase
            .from("students")
            .insert({ full_name: `تلميذ فحص ${Date.now()}`, gender: "M" })
            .select("id")
            .single();
          if (e1) throw new Error(`INSERT: ${e1.message}`);
          const { error: e2 } = await supabase
            .from("students")
            .update({ fake_phone: "0000000000" })
            .eq("id", created.id);
          if (e2) throw new Error(`UPDATE: ${e2.message}`);
          const { error: e3 } = await supabase.from("students").delete().eq("id", created.id);
          if (e3) throw new Error(`DELETE: ${e3.message}`);
          return "إنشاء + تعديل + حذف ناجح";
        },
      },
      {
        id: "crud:behavior",
        group: "CRUD",
        label: "تسجيل سلوك ثم حذفه",
        run: async () => {
          const { data: created, error: e1 } = await supabase
            .from("behavior_records")
            .insert({ record_type: "positive", points: 1, title: "فحص آلي" })
            .select("id")
            .single();
          if (e1) throw new Error(`INSERT: ${e1.message}`);
          const { error: e2 } = await supabase
            .from("behavior_records")
            .delete()
            .eq("id", created.id);
          if (e2) throw new Error(`DELETE: ${e2.message}`);
          return "ناجح";
        },
      },
      {
        id: "crud:notification",
        group: "CRUD",
        label: "إنشاء إشعار (الحذف ممنوع بالسياسة)",
        run: async () => {
          const { data: u } = await supabase.auth.getUser();
          const { data, error } = await supabase
            .from("notifications")
            .insert({
              title: "فحص آلي",
              body: "رسالة اختبار من صفحة تقرير الفحص",
              channel: "inapp",
              status: "sent",
              recipient_id: u.user?.id ?? null,
            })
            .select("id")
            .single();
          if (error) throw new Error(`INSERT: ${error.message}`);
          return `تم الإنشاء (${data.id.slice(0, 8)}…)`;
        },
      },

      // ── Attendance ───────────────────────────────────────
      {
        id: "attendance:flow",
        group: "الحضور",
        label: "حصة + تسجيل حضور + تعديل الحالة",
        run: async () => {
          const { data: u } = await supabase.auth.getUser();
          if (!u.user) throw new Error("لا يوجد مستخدم");
          const { data: cls, error: ce } = await supabase
            .from("classes")
            .insert({ name: `قسم فحص ${Date.now()}` })
            .select("id")
            .single();
          if (ce) throw new Error(`CLASS: ${ce.message}`);
          const { data: st, error: se } = await supabase
            .from("students")
            .insert({ full_name: `تلميذ حضور ${Date.now()}`, class_id: cls.id })
            .select("id")
            .single();
          if (se) throw new Error(`STUDENT: ${se.message}`);
          const { data: sess, error: e1 } = await supabase
            .from("attendance_sessions")
            .insert({
              class_id: cls.id,
              teacher_id: u.user.id,
              session_date: new Date().toISOString().slice(0, 10),
              subject: "فحص آلي",
            })
            .select("id")
            .single();
          if (e1) throw new Error(`SESSION: ${e1.message}`);
          const { data: rec, error: e2 } = await supabase
            .from("attendance_records")
            .insert({ session_id: sess.id, student_id: st.id, status: "present" })
            .select("id")
            .single();
          if (e2) throw new Error(`RECORD: ${e2.message}`);
          const { error: e3 } = await supabase
            .from("attendance_records")
            .update({ status: "absent" })
            .eq("id", rec.id);
          if (e3) throw new Error(`UPDATE: ${e3.message}`);
          // cleanup
          await supabase.from("attendance_records").delete().eq("id", rec.id);
          await supabase.from("attendance_sessions").delete().eq("id", sess.id);
          await supabase.from("students").delete().eq("id", st.id);
          await supabase.from("classes").delete().eq("id", cls.id);
          return "الدورة الكاملة ناجحة (مع تنظيف البيانات)";
        },
      },
      {
        id: "attendance:late-guard",
        group: "الحضور",
        label: "منع تعديل حالة «متأخر» بدون تبرير",
        run: async () => {
          const { data: u } = await supabase.auth.getUser();
          if (!u.user) throw new Error("لا يوجد مستخدم");
          const { data: cls } = await supabase
            .from("classes")
            .insert({ name: `قسم تأخر ${Date.now()}` })
            .select("id")
            .single();
          if (!cls) throw new Error("تعذّر إنشاء قسم للفحص");
          const { data: st } = await supabase
            .from("students")
            .insert({ full_name: `تلميذ تأخر ${Date.now()}`, class_id: cls.id })
            .select("id")
            .single();
          const { data: sess } = await supabase
            .from("attendance_sessions")
            .insert({
              class_id: cls.id,
              teacher_id: u.user.id,
              session_date: new Date().toISOString().slice(0, 10),
            })
            .select("id")
            .single();
          let verdict = "";
          if (st && sess) {
            const { data: rec } = await supabase
              .from("attendance_records")
              .insert({ session_id: sess.id, student_id: st.id, status: "late" })
              .select("id")
              .single();
            if (rec) {
              const { error } = await supabase
                .from("attendance_records")
                .update({ status: "present" })
                .eq("id", rec.id);
              verdict = error
                ? "الحماية فعّالة — تم رفض التعديل"
                : "⚠ الحماية غير فعّالة — تم قبول التعديل";
              await supabase.from("attendance_records").delete().eq("id", rec.id);
            }
            await supabase.from("attendance_sessions").delete().eq("id", sess.id);
            await supabase.from("students").delete().eq("id", st.id);
          }
          await supabase.from("classes").delete().eq("id", cls.id);
          if (!verdict) throw new Error("تعذّر تنفيذ الفحص");
          if (verdict.startsWith("⚠")) throw new Error(verdict);
          return verdict;
        },
      },

      // ── Export ───────────────────────────────────────────
      {
        id: "export:excel",
        group: "التصدير",
        label: "توليد ملف Excel (xlsx)",
        run: async () => {
          const XLSX = await import("xlsx");
          const ws = XLSX.utils.json_to_sheet([{ الاسم: "فحص", القسم: "1" }]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Test");
          const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
          if (!out.byteLength) throw new Error("الملف الناتج فارغ");
          return `${out.byteLength} بايت`;
        },
      },
      {
        id: "export:pdf",
        group: "التصدير",
        label: "توليد ملف PDF مع جدول",
        run: async () => {
          const { default: jsPDF } = await import("jspdf");
          const autoTableMod = await import("jspdf-autotable");
          const autoTable = (
            autoTableMod as unknown as { default: (doc: unknown, opts: unknown) => void }
          ).default;
          const doc = new jsPDF({ orientation: "landscape" });
          doc.text("Diagnostics", 14, 16);
          autoTable(doc, { head: [["A", "B"]], body: [["1", "2"]], startY: 22 });
          const blob = doc.output("blob") as Blob;
          if (!blob.size) throw new Error("الملف الناتج فارغ");
          return `${blob.size} بايت`;
        },
      },
      {
        id: "export:csv-template",
        group: "التصدير",
        label: "قوالب الاستيراد (CSV)",
        run: async () => {
          const { getTemplate } = await import("@/lib/import-templates");
          const t = getTemplate("student");
          if (!t?.headers?.length) throw new Error("القالب فارغ");
          return `${t.headers.length} عمود`;
        },
      },

      // ── Printing ─────────────────────────────────────────
      {
        id: "print:api",
        group: "الطباعة",
        label: "توفر واجهة الطباعة في المتصفح",
        run: async () => {
          if (typeof window.print !== "function") throw new Error("window.print غير متاح");
          return "متاح";
        },
      },
      {
        id: "print:route",
        group: "الطباعة",
        label: "صفحة طباعة البطاقات تستجيب",
        run: async () => {
          const res = await fetch("/dashboard/cards/print", { method: "GET" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return `HTTP ${res.status}`;
        },
      },
      {
        id: "print:styles",
        group: "الطباعة",
        label: "وجود أنماط الطباعة (@media print)",
        run: async () => {
          let found = 0;
          for (const sheet of Array.from(document.styleSheets)) {
            try {
              for (const rule of Array.from(sheet.cssRules)) {
                if (rule.cssText.includes("print")) found++;
              }
            } catch {
              /* cross-origin sheet */
            }
          }
          if (!found) throw new Error("لم يتم العثور على قواعد طباعة");
          return `${found} قاعدة`;
        },
      },

      // ── Platform ─────────────────────────────────────────
      {
        id: "platform:realtime",
        group: "المنصة",
        label: "الاتصال اللحظي (Realtime)",
        run: async () => {
          const channel = supabase.channel(`diag-${Date.now()}`);
          const state = await new Promise<string>((resolve) => {
            const timer = setTimeout(() => resolve("TIMEOUT"), 8000);
            channel.subscribe((status) => {
              if (status === "SUBSCRIBED" || status.includes("ERROR") || status === "TIMED_OUT") {
                clearTimeout(timer);
                resolve(status);
              }
            });
          });
          await supabase.removeChannel(channel);
          if (state !== "SUBSCRIBED") throw new Error(state);
          return "متصل";
        },
      },
      {
        id: "platform:storage",
        group: "المنصة",
        label: "تخزين الصور الرمزية (avatars)",
        run: async () => {
          const { error } = await supabase.storage.from("avatars").list("", { limit: 1 });
          if (error) throw new Error(error.message);
          return "الوصول متاح";
        },
      },
      {
        id: "platform:stats-rpc",
        group: "المنصة",
        label: "دالة الإحصائيات get_overview_stats",
        run: async () => {
          const { data, error } = await supabase.rpc("get_overview_stats");
          if (error) throw new Error(error.message);
          const obj = (data ?? {}) as Record<string, number>;
          return Object.entries(obj)
            .map(([k, v]) => `${k}:${v}`)
            .join("، ");
        },
      },
      {
        id: "platform:version",
        group: "المنصة",
        label: "ملف الإصدار version.json",
        run: async () => {
          const res = await fetch("/version.json", { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as { version?: string };
          if (!json.version) throw new Error("الحقل version مفقود");
          return `الإصدار ${json.version}`;
        },
      },
    ];
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Check[]>();
    for (const c of checks) {
      const arr = map.get(c.group) ?? [];
      arr.push(c);
      map.set(c.group, arr);
    }
    return Array.from(map.entries());
  }, [checks]);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults({});
    for (const check of checks) {
      setResults((r) => ({ ...r, [check.id]: { status: "running" } }));
      const started = performance.now();
      try {
        const detail = await check.run();
        setResults((r) => ({
          ...r,
          [check.id]: {
            status: "pass",
            detail: detail || undefined,
            ms: Math.round(performance.now() - started),
          },
        }));
      } catch (e) {
        setResults((r) => ({
          ...r,
          [check.id]: {
            status: "fail",
            detail: errText(e),
            ms: Math.round(performance.now() - started),
          },
        }));
      }
    }
    setRunning(false);
  }, [checks]);

  const summary = useMemo(() => {
    const values = Object.values(results);
    return {
      total: checks.length,
      pass: values.filter((v) => v.status === "pass").length,
      fail: values.filter((v) => v.status === "fail").length,
      done: values.filter((v) => v.status === "pass" || v.status === "fail").length,
    };
  }, [results, checks.length]);

  const copyReport = () => {
    const lines = checks.map((c) => {
      const r = results[c.id];
      const mark = r?.status === "pass" ? "PASS" : r?.status === "fail" ? "FAIL" : "SKIP";
      return `[${mark}] ${c.group} — ${c.label}${r?.detail ? ` :: ${r.detail}` : ""}`;
    });
    void navigator.clipboard.writeText(
      `تقرير فحص إداروم — ${new Date().toLocaleString("ar")}\n${lines.join("\n")}`,
    );
  };

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="تقرير فحص النظام"
        description="تشغيل فحص حي لكل الميزات الأساسية: القراءة، CRUD، الحضور، التصدير، الطباعة والمنصة."
        icon={<Stethoscope className="h-8 w-8" />}
        actions={
          <>
            <Button onClick={runAll} disabled={running}>
              {running ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="ml-2 h-4 w-4" />
              )}
              تشغيل كل الفحوص
            </Button>
            <Button variant="outline" onClick={copyReport} disabled={!summary.done}>
              نسخ التقرير
            </Button>
          </>
        }
      />

      {!previewEnv ? (
        <p className="mb-4 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          تنبيه: هذه الصفحة مخصّصة لبيئة الاختبار — الفحوص تُنشئ بيانات مؤقتة ثم تحذفها.
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-3">
        <Badge variant="secondary">المجموع: {summary.total}</Badge>
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
          ناجح: {summary.pass}
        </Badge>
        <Badge variant="destructive">فاشل: {summary.fail}</Badge>
        <Badge variant="outline">
          منفّذ: {summary.done}/{summary.total}
        </Badge>
      </div>

      <div className="grid gap-4">
        {groups.map(([group, items]) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="font-display text-xl">{group}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((c) => {
                const r = results[c.id] ?? { status: "idle" as Status };
                return (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <StatusIcon status={r.status} />
                      <div>
                        <p className="text-sm font-medium">{c.label}</p>
                        {r.detail ? (
                          <p
                            className={`mt-0.5 text-xs ${
                              r.status === "fail" ? "text-destructive" : "text-muted-foreground"
                            }`}
                          >
                            {r.detail}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.ms != null ? (
                        <span className="text-xs text-muted-foreground">{r.ms}ms</span>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={running || r.status === "running"}
                        onClick={async () => {
                          setResults((s) => ({ ...s, [c.id]: { status: "running" } }));
                          const t = performance.now();
                          try {
                            const detail = await c.run();
                            setResults((s) => ({
                              ...s,
                              [c.id]: {
                                status: "pass",
                                detail: detail || undefined,
                                ms: Math.round(performance.now() - t),
                              },
                            }));
                          } catch (e) {
                            setResults((s) => ({
                              ...s,
                              [c.id]: {
                                status: "fail",
                                detail: errText(e),
                                ms: Math.round(performance.now() - t),
                              },
                            }));
                          }
                        }}
                      >
                        إعادة
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "running") return <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />;
  if (status === "pass") return <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />;
  if (status === "fail") return <XCircle className="mt-0.5 h-4 w-4 text-destructive" />;
  if (status === "skip") return <MinusCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />;
  return <MinusCircle className="mt-0.5 h-4 w-4 text-muted-foreground/50" />;
}
