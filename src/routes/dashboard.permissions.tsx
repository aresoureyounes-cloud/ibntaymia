import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Lock, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { listAccounts } from "@/lib/admin-accounts.functions";
import { PERMISSION_GROUPS, LIMIT_SETTINGS } from "@/lib/permissions";

export const Route = createFileRoute("/dashboard/permissions")({
  head: () => ({
    meta: [
      { title: "إعدادات الحسابات والصلاحيات — إداروم" },
      { name: "description", content: "ضبط ما يسمح به لكل دور ولكل حساب في منصة إداروم." },
      { property: "og:title", content: "إعدادات الحسابات والصلاحيات — إداروم" },
      { property: "og:description", content: "ضبط ما يسمح به لكل دور ولكل حساب في منصة إداروم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PermissionsPage,
});

const ROLES = [
  { key: "teacher", label: "أستاذ" },
  { key: "supervisor", label: "ناظر/مراقب" },
  { key: "director", label: "مدير" },
  { key: "parent", label: "ولي" },
  { key: "student", label: "تلميذ" },
  { key: "gate_monitor", label: "حارس" },
] as const;

// Tables are newer than the generated types.
const db = supabase as unknown as { from: (t: string) => any };

function PermissionsPage() {
  const { user, hasRole, loading } = useAuth();
  const canEdit = hasRole("admin");

  if (loading) return null;
  if (!canEdit)
    return <p className="p-6 text-sm text-muted-foreground">هذه الصفحة مخصصة للمدير العام والمبرمج فقط.</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="إعدادات الحسابات والصلاحيات"
        description="حدد ما يسمح به لكل دور، واستثن حسابات بعينها، واضبط الحدود الزمنية."
      />
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            إضافة الحسابات وحذفها وتعديل بياناتها وأدوارها وكلمات مرورها وتجميدها:
          </span>
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard/users">فتح إدارة الحسابات</Link>
          </Button>
        </CardContent>
      </Card>
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">صلاحيات الأدوار</TabsTrigger>
          <TabsTrigger value="users">استثناءات الحسابات</TabsTrigger>
          <TabsTrigger value="limits">الحدود</TabsTrigger>
        </TabsList>
        <TabsContent value="roles"><RoleMatrix userId={user?.id} /></TabsContent>
        <TabsContent value="users"><UserOverrides userId={user?.id} /></TabsContent>
        <TabsContent value="limits"><Limits userId={user?.id} /></TabsContent>
      </Tabs>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> الصلاحيات المعلّمة بقفل تفرضها قاعدة البيانات نفسها ولا يمكن تجاوزها. المدير العام والمبرمج يملكان كل الصلاحيات دائماً، والإدارة (مدير، ناظر) لا تخضع لقيود الحضور.
      </p>
    </div>
  );
}

function RoleMatrix({ userId }: { userId?: string }) {
  const [map, setMap] = useState<Record<string, boolean>>({});
  const load = useCallback(async () => {
    const { data } = await db.from("role_permissions").select("role, permission, allowed");
    const m: Record<string, boolean> = {};
    (data ?? []).forEach((r: any) => (m[`${r.role}|${r.permission}`] = r.allowed));
    setMap(m);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(role: string, perm: string, allowed: boolean) {
    setMap((m) => ({ ...m, [`${role}|${perm}`]: allowed }));
    const { error } = await db
      .from("role_permissions")
      .upsert({ role, permission: perm, allowed, updated_by: userId, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); load(); } else toast.success("تم الحفظ");
  }

  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map((g) => (
        <Card key={g.title}>
          <CardHeader><CardTitle className="text-base">{g.title}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-2 text-start font-medium">الصلاحية</th>
                  {ROLES.map((r) => <th key={r.key} className="px-2 py-2 text-center font-medium">{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {g.items.map((p) => (
                  <tr key={p.key} className="border-t border-border">
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        {p.enforced && <Lock className="h-3 w-3 text-muted-foreground" />}
                        {p.label}
                      </div>
                      {p.hint && <div className="text-xs text-muted-foreground">{p.hint}</div>}
                    </td>
                    {ROLES.map((r) => (
                      <td key={r.key} className="px-2 py-2 text-center">
                        <Switch
                          checked={!!map[`${r.key}|${p.key}`]}
                          onCheckedChange={(v) => toggle(r.key, p.key, v)}
                          aria-label={`${p.label} — ${r.label}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type Account = { id: string; email: string | null; fullName: string | null; roles: string[] };

function UserOverrides({ userId }: { userId?: string }) {
  const fetchAccounts = useServerFn(listAccounts);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Account | null>(null);
  const [ovr, setOvr] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchAccounts().then((a) => setAccounts(a as Account[])).catch((e) => toast.error(String(e.message ?? e)));
  }, [fetchAccounts]);

  useEffect(() => {
    if (!sel) return;
    db.from("user_permission_overrides").select("permission, allowed").eq("user_id", sel.id).then(({ data }: any) => {
      const m: Record<string, boolean> = {};
      (data ?? []).forEach((r: any) => (m[r.permission] = r.allowed));
      setOvr(m);
    });
  }, [sel]);

  const filtered = useMemo(
    () => accounts.filter((a) => `${a.fullName ?? ""} ${a.email ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50),
    [accounts, q],
  );

  async function setMode(perm: string, mode: "inherit" | "allow" | "deny") {
    if (!sel) return;
    if (mode === "inherit") {
      const { error } = await db.from("user_permission_overrides").delete().eq("user_id", sel.id).eq("permission", perm);
      if (error) return toast.error(error.message);
      setOvr((m) => { const n = { ...m }; delete n[perm]; return n; });
    } else {
      const allowed = mode === "allow";
      const { error } = await db.from("user_permission_overrides").upsert({
        user_id: sel.id, permission: perm, allowed, updated_by: userId, updated_at: new Date().toISOString(),
      });
      if (error) return toast.error(error.message);
      setOvr((m) => ({ ...m, [perm]: allowed }));
    }
    toast.success("تم الحفظ");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card>
        <CardContent className="space-y-2 pt-4">
          <Input placeholder="بحث بالاسم أو البريد" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-[520px] space-y-1 overflow-y-auto">
            {filtered.map((a) => (
              <button
                key={a.id}
                onClick={() => setSel(a)}
                className={`w-full rounded-md px-2 py-2 text-start text-sm hover:bg-muted ${sel?.id === a.id ? "bg-muted" : ""}`}
              >
                <div className="font-medium">{a.fullName ?? a.email}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">{a.email}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          {!sel ? (
            <p className="text-sm text-muted-foreground">اختر حساباً لمنحه أو سحب صلاحية منه بشكل خاص، بغض النظر عن دوره.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                <span className="font-semibold">{sel.fullName ?? sel.email}</span>
                {sel.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
              </div>
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.title}>
                  <div className="mb-2 text-sm font-semibold">{g.title}</div>
                  <div className="space-y-2">
                    {g.items.map((p) => {
                      const mode = p.key in ovr ? (ovr[p.key] ? "allow" : "deny") : "inherit";
                      return (
                        <div key={p.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                          <span>{p.label}</span>
                          <div className="flex gap-1">
                            {(["inherit", "allow", "deny"] as const).map((m) => (
                              <Button key={m} size="sm" variant={mode === m ? (m === "deny" ? "destructive" : "default") : "outline"} onClick={() => setMode(p.key, m)}>
                                {m === "inherit" ? "حسب الدور" : m === "allow" ? "مسموح" : "ممنوع"}
                              </Button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Limits({ userId }: { userId?: string }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    db.from("access_settings").select("key, value").then(({ data }: any) => {
      const m: Record<string, string> = {};
      (data ?? []).forEach((r: any) => (m[r.key] = String(r.value)));
      setVals(m);
    });
  }, []);
  async function save(key: string) {
    const n = Number(vals[key]);
    if (!Number.isFinite(n) || n < 0) return toast.error("أدخل رقماً صحيحاً موجباً");
    const { error } = await db.from("access_settings").upsert({ key, value: Math.floor(n), updated_by: userId, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else toast.success("تم الحفظ");
  }
  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        {LIMIT_SETTINGS.map((s) => (
          <div key={s.key} className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.hint} — ينطبق على الأساتذة فقط</div>
            </div>
            <Input type="number" min={0} className="w-28" value={vals[s.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [s.key]: e.target.value }))} />
            <Button size="sm" onClick={() => save(s.key)}>حفظ</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
