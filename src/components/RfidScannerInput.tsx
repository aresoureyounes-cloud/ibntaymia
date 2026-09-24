import { useEffect, useRef, useState } from "react";
import { ScanLine, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Captures EM4100 USB RFID reader input (acts as HID keyboard).
 * The reader types digits then sends Enter. We keep a hidden input
 * permanently focused so any scan anywhere on the page is captured.
 *
 * Heuristic: an input ending in Enter, with a length >= 4, delivered
 * within ~500ms total typing window is treated as a card scan.
 */
export function RfidScannerInput({
  onScan,
  paused = false,
}: {
  onScan: (cardUid: string) => void;
  paused?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const [lastUid, setLastUid] = useState<string>("");
  const [flash, setFlash] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualUid, setManualUid] = useState("");

  // Keep focus on the hidden input — but never steal focus from real form fields.
  useEffect(() => {
    const isTypingTarget = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    };
    const focus = () => {
      if (paused) return;
      if (isTypingTarget(document.activeElement)) return;
      inputRef.current?.focus();
    };
    focus();
    const onClick = (e: MouseEvent) => {
      if (isTypingTarget(e.target as Element)) return;
      setTimeout(focus, 0);
    };
    const onVisibility = () => focus();
    window.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(focus, 1500);
    return () => {
      window.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [paused]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    // Reset buffer if too much idle time since last keystroke
    if (now - lastKeyTimeRef.current > 800) {
      bufferRef.current = "";
    }
    lastKeyTimeRef.current = now;

    if (e.key === "Enter") {
      e.preventDefault();
      const uid = bufferRef.current.trim();
      bufferRef.current = "";
      if (uid.length >= 4) {
        setLastUid(uid);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 250);
        onScan(uid);
      }
      return;
    }

    if (e.key.length === 1) {
      bufferRef.current += e.key;
    }
  };

  return (
    <div className="space-y-2">
      <div
      className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 transition-colors ${
        flash
          ? "border-primary bg-primary/10"
          : paused
            ? "border-muted bg-muted/30"
            : "border-dashed border-primary/40 bg-card"
      }`}
    >
      <ScanLine className={`h-6 w-6 ${flash ? "text-primary" : "text-muted-foreground"}`} />
      <div className="flex-1">
        <p className="text-sm font-medium">
          {paused ? "القارئ موقوف" : "مرّر البطاقة فوق القارئ..."}
        </p>
        <p className="text-xs text-muted-foreground ltr">آخر بطاقة: {lastUid || "—"}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setManualOpen((v) => !v)}
        disabled={paused}
      >
        <Keyboard className="h-4 w-4 me-1" />
        إدخال يدوي
      </Button>
      {/* Hidden but focused input that captures the reader's keystrokes */}
      <input
        ref={inputRef}
        onKeyDown={handleKey}
        className="sr-only"
        aria-label="RFID scanner input"
        autoComplete="off"
      />
      </div>
      {manualOpen && !paused && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const uid = manualUid.trim();
            if (uid.length >= 4) {
              setLastUid(uid);
              setFlash(true);
              window.setTimeout(() => setFlash(false), 250);
              onScan(uid);
              setManualUid("");
            }
          }}
        >
          <Input
            value={manualUid}
            onChange={(e) => setManualUid(e.target.value)}
            placeholder="أدخل رقم البطاقة UID يدوياً"
            className="ltr"
            autoFocus
          />
          <Button type="submit" disabled={manualUid.trim().length < 4}>
            تأكيد
          </Button>
        </form>
      )}
    </div>
  );
}
