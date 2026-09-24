import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const DOMAIN = "demo.idarroom.dz";
const PASSWORD = "Demo@2026";

const DEMO_ACCOUNTS: { label: string; email: string }[] = [
  { label: "مدير النظام", email: `admin@${DOMAIN}` },
  { label: "المدير", email: `director@${DOMAIN}` },
  { label: "الناظر", email: `supervisor@${DOMAIN}` },
  { label: "أستاذ", email: `teacher.math@${DOMAIN}` },
  { label: "حارس البوابة", email: `gate@${DOMAIN}` },
  { label: "وليّ", email: `parent1@${DOMAIN}` },
  { label: "تلميذ", email: `student1@${DOMAIN}` },
];

/** Quick sign-in shortcuts — shown only in local dev and Lovable preview builds. */
export function DemoLoginPanel() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const host = window.location.hostname;
    setVisible(
      host === "localhost" ||
        host === "127.0.0.1" ||
        host.includes("id-preview") ||
        host.endsWith("-dev.lovable.app"),
    );
  }, []);

  if (!visible) return null;

  const login = async (email: string) => {
    setBusy(email);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
      if (error) throw error;
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-dashed border-border p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">
        دخول تجريبي سريع (بيئة المعاينة فقط)
      </p>
      <div className="flex flex-wrap gap-2">
        {DEMO_ACCOUNTS.map((a) => (
          <Button
            key={a.email}
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy !== null}
            onClick={() => login(a.email)}
          >
            {busy === a.email ? "..." : a.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        كل الحسابات التجريبية بكلمة مرور: {PASSWORD}
      </p>
    </div>
  );
}
