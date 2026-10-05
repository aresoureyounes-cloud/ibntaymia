import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { searchSavedPages } from "@/lib/page-search.functions";

const PAGES_CACHE = "idaroom-pages";

async function readPageText(url: string) {
  const cache = await caches.open(PAGES_CACHE);
  const res = await cache.match(url);
  if (!res) return { title: "", excerpt: "" };
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript,svg").forEach((n) => n.remove());
  const title = (doc.title || doc.querySelector("h1")?.textContent || "").trim().slice(0, 300);
  const excerpt = (doc.body?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1500);
  return { title, excerpt };
}

export function AiPageFinder({ entries }: { entries: { url: string; path: string }[] }) {
  const search = useServerFn(searchSavedPages);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ url: string; path: string; reason: string }[] | null>(
    null,
  );

  const run = async () => {
    const q = query.trim();
    if (q.length < 2 || busy) return;
    if (!navigator.onLine) {
      setError("البحث الذكي يحتاج اتصالاً بالإنترنت.");
      return;
    }
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const pages = await Promise.all(
        entries
          .slice(0, 80)
          .map(async (e) => ({ url: e.url, path: e.path, ...(await readPageText(e.url)) })),
      );
      const r = await search({ data: { query: q, pages } });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResults(
        r.matches.map((m) => ({
          ...m,
          path: entries.find((e) => e.url === m.url)?.path ?? m.url,
        })),
      );
    } catch {
      setError("تعذر البحث الآن، حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4" /> البحث الذكي في الصفحات المحفوظة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="صف المعلومة التي تبحث عنها، مثال: غيابات قسم 2 علوم يوم الأحد"
          rows={2}
          maxLength={500}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            يُرسل نص الصفحات المحفوظة إلى خدمة الذكاء الاصطناعي لاختيار الأنسب. يتطلب اتصالاً.
          </p>
          <Button
            size="sm"
            onClick={() => void run()}
            disabled={busy || !entries.length || query.trim().length < 2}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{" "}
            بحث
          </Button>
        </div>
        {!entries.length && (
          <p className="text-sm text-muted-foreground">لا توجد صفحات محفوظة للبحث فيها بعد.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {results && results.length === 0 && (
          <p className="text-sm text-muted-foreground">لم يتم العثور على صفحة مناسبة.</p>
        )}
        {results && results.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {results.map((r) => (
              <li key={r.url} className="p-3">
                <a
                  href={r.url}
                  dir="ltr"
                  className="block truncate text-start font-mono text-sm text-primary underline-offset-2 hover:underline"
                >
                  {r.path}
                </a>
                <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
