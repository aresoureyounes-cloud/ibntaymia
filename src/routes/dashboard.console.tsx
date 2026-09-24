import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TerminalSquare, CornerDownLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";
import { useTheme } from "@/lib/theme";
import { useAppUpdate } from "@/lib/use-app-update";
import { UpdateProgressDialog } from "@/components/UpdateProgressDialog";
import { COMMANDS, runCommand, type ConsoleLine } from "@/lib/console-commands";
import { APP_VERSION } from "@/lib/app-version";

export const Route = createFileRoute("/dashboard/console")({
  head: () => ({
    meta: [
      { title: "الطرفية — إداروم" },
      {
        name: "description",
        content: "طرفية إداروم داخل التطبيق: نفّذ أوامر التنقل والتحديث والكاش والأدوار مباشرة.",
      },
      { property: "og:title", content: "الطرفية — إداروم" },
      {
        property: "og:description",
        content: "طرفية إداروم داخل التطبيق: نفّذ أوامر التنقل والتحديث والكاش والأدوار مباشرة.",
      },
    ],
  }),
  component: ConsolePage,
});

function ConsolePage() {
  const navigate = useNavigate();
  const { roles, user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { i18n } = useTranslation();
  const { check, apply, applying, progress, remote } = useAppUpdate();

  const [lines, setLines] = useState<ConsoleLine[]>([
    { kind: "info", text: `IDAROOM terminal v${APP_VERSION} — اكتب "help" لعرض الأوامر.` },
  ]);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  async function submit(raw: string) {
    const input = raw.trim();
    if (!input || busy) return;
    setLines((l) => [...l, { kind: "in", text: `idaroom> ${input}` }]);
    setHistory((h) => [input, ...h].slice(0, 50));
    setHistIdx(-1);
    setValue("");
    setBusy(true);
    const out = await runCommand(input, {
      roles,
      email: user?.email ?? null,
      navigate: (to) => void navigate({ to }),
      setTheme,
      theme,
      setLanguage: (lng) => void i18n.changeLanguage(lng),
      language: i18n.language,
      signOut,
      checkUpdate: check,
      applyUpdate: () => void apply(),
      clear: () => setLines([]),
    });
    setLines((l) => [...l, ...out]);
    setBusy(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      void submit(value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      if (next >= 0) {
        setHistIdx(next);
        setValue(history[next]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdx - 1;
      setHistIdx(next);
      setValue(next >= 0 ? history[next] : "");
    } else if (e.key === "Tab") {
      e.preventDefault();
      const match = COMMANDS.find((c) => c.name.startsWith(value.trim()));
      if (match) setValue(match.name + " ");
    }
  }

  return (
    <div className="space-y-6">
      <UpdateProgressDialog open={applying} progress={progress} remote={remote} />
      <PageHeader
        title="الطرفية"
        description="تحكّم كامل بالتطبيق عبر أوامر نصية — نفس أوامر سطر الأوامر في لينكس."
      />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
            <TerminalSquare className="h-4 w-4" />
            idaroom — console
          </div>
          <div
            dir="ltr"
            onClick={() => inputRef.current?.focus()}
            className="h-[420px] overflow-y-auto bg-[#0d1512] px-4 py-3 font-mono text-[13px] leading-6 text-emerald-100"
          >
            {lines.map((l, i) => (
              <pre
                key={i}
                className={`whitespace-pre-wrap break-words ${
                  l.kind === "in"
                    ? "text-emerald-400"
                    : l.kind === "err"
                      ? "text-red-400"
                      : l.kind === "info"
                        ? "text-amber-300"
                        : "text-emerald-100/90"
                }`}
              >
                {l.text}
              </pre>
            ))}
            <div ref={endRef} />
          </div>
          <div dir="ltr" className="flex items-center gap-2 border-t border-border bg-[#0d1512] px-4 py-3">
            <span className="font-mono text-sm text-emerald-400">idaroom&gt;</span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
              aria-label="command input"
              className="flex-1 bg-transparent font-mono text-sm text-emerald-100 outline-none placeholder:text-emerald-100/30"
              placeholder="help"
            />
            <Button size="sm" variant="secondary" onClick={() => void submit(value)} disabled={busy}>
              <CornerDownLeft className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-2 p-4 sm:grid-cols-2">
          {COMMANDS.map((c) => (
            <button
              key={c.name}
              onClick={() => void submit(c.name)}
              className="rounded-lg border border-border p-3 text-right transition hover:bg-muted"
            >
              <div dir="ltr" className="font-mono text-xs text-primary">
                {c.usage}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{c.description}</div>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
