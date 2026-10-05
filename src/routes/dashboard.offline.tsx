import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2, WifiOff, FileText, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { searchSavedPages } from "@/lib/page-search.functions";

export const Route = createFileRoute("/dashboard/offline")({
  head: () => ({
    meta: [
      { title: "الصفحات المحفوظة للعمل دون اتصال — إداروم" },
      { name: "description", content: "عرض الصفحات المخزنة على الجهاز ووقت آخر تحديث وحذفها." },
      { property: "og:title", content: "الصفحات المحفوظة — إداروم" },
      { property: "og:description", content: "إدارة النسخ المخزنة على الجهاز للعمل دون اتصال." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfflinePagesScreen,
});

const PAGES_CACHE = "idaroom-pages";

type Entry = { url: string; path: string; updated: Date | null; size: number | null };

function formatSize(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function OfflinePagesScreen() {
  const [supported, setSupported] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [otherCount, setOtherCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);

  const load = useCallback(async () => {
    if (!("caches" in window)) {
      setSupported(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const cache = await caches.open(PAGES_CACHE);
      const reqs = await cache.keys();
      const list: Entry[] = [];
      for (const req of reqs) {
        const res = await cache.match(req);
        const date = res?.headers.get("date");
        const len = res?.headers.get("content-length");
        const u = new URL(req.url);
        list.push({
          url: req.url,
          path: decodeURIComponent(u.pathname + u.search),
          updated: date ? new Date(date) : null,
          size: len ? Number(len) : null,
        });
      }
      list.sort((a, b) => (b.updated?.getTime() ?? 0) - (a.updated?.getTime() ?? 0));
      setEntries(list);
      const names = await caches.keys();
      setOtherCount(names.filter((n) => n !== PAGES_CACHE).length);
      if (navigator.storage?.estimate) {
        const e = await navigator.storage.estimate();
        setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeOne = async (url: string) => {
    const cache = await caches.open(PAGES_CACHE);
    await cache.delete(url);
    toast.success("حُذفت النسخة المخزنة");
    void load();
  };

  const removePages = async () => {
    if (!confirm("حذف جميع الصفحات المحفوظة؟ لن تكون متاحة دون اتصال حتى تفتحها من جديد.")) return;
    await caches.delete(PAGES_CACHE);
    toast.success("حُذفت جميع الصفحات المحفوظة");
    void load();
  };

  const removeAll = async () => {
    if (!confirm("حذف كل النسخ المخزنة (الصفحات وملفات التطبيق)؟ سيُعاد تنزيلها عند الاتصال.")) return;
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
    toast.success("حُذفت جميع النسخ المخزنة");
    void load();
  };

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <WifiOff className="h-6 w-6" /> الصفحات المحفوظة للعمل دون اتصال
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            كل صفحة تفتحها أثناء الاتصال تُحفظ على هذا الجهاز وتُعرض عند انقطاع الإنترنت. المحتوى
            المعروض دون اتصال هو آخر نسخة محفوظة.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث القائمة
        </Button>
      </div>

      {!supported ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            هذا المتصفح لا يدعم حفظ الصفحات للعمل دون اتصال.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">صفحات محفوظة</div>
                <div className="text-2xl font-bold">{entries.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">مساحة مستعملة</div>
                <div className="text-2xl font-bold">{usage ? formatSize(usage.used) : "—"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">مجموعات ملفات التطبيق</div>
                <div className="text-2xl font-bold">{otherCount}</div>
              </CardContent>
            </Card>
          </div>

          <AiPageFinder entries={entries} />


          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">قائمة الصفحات</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={removePages} disabled={!entries.length}>
                  <Trash2 className="h-4 w-4" /> حذف الصفحات
                </Button>
                <Button variant="destructive" size="sm" onClick={removeAll}>
                  <Trash2 className="h-4 w-4" /> حذف كل النسخ
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
              ) : entries.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  لا توجد صفحات محفوظة على هذا الجهاز. الحفظ يعمل في الموقع المنشور فقط، وتُحفظ
                  الصفحة عند فتحها أثناء الاتصال.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {entries.map((e) => (
                    <li key={e.url} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div dir="ltr" className="truncate text-start font-mono text-sm">
                            {e.path}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            آخر تحديث:{" "}
                            {e.updated
                              ? e.updated.toLocaleString("ar-DZ", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "غير معروف"}{" "}
                            · {formatSize(e.size)}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="حذف"
                        onClick={() => void removeOne(e.url)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
