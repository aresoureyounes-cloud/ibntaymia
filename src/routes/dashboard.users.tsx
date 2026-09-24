import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, MailCheck, Plus, RefreshCw, RotateCcw, ShieldAlert, Trash2, UserCog } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth, type AppRole } from "@/lib/use-auth";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  resetAccountPassword,
  setAccountDisabled,
  setAccountPassword,
  setAccountRoles,

  updateAccount,
} from "@/lib/admin-accounts.functions";

export const Route = createFileRoute("/dashboard/users")({
  head: () => ({
    meta: [
      { title: "إدارة الحسابات والأدوار — إداروم" },
      {
        name: "description",
        content:
          "إنشاء الحسابات وتعديلها، منح أو سحب الأدوار والصلاحيات بما فيها دور المبرّمج، وتغيير كلمات المرور داخل منصة إداروم.",
      },
      { property: "og:title", content: "إدارة الحسابات والأدوار — إداروم" },
      {
        property: "og:description",
        content: "لوحة تحكّم كاملة بالحسابات والأدوار والصلاحيات لمنصة إداروم.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

const ALL_ROLES: AppRole[] = [
  "developer",
  "admin",
  "director",
  "supervisor",
  "teacher",
  "gate_monitor",
  "parent",
  "student",
];

const ROLE_LABEL: Record<string, string> = {
  developer: "مبرّمج / صيانة تقنية",
  admin: "مدير النظام",
  director: "المدير",
  supervisor: "الناظر",
  teacher: "أستاذ",
  gate_monitor: "حارس البوابة",
  parent: "وليّ",
  student: "تلميذ",
};

type Account = {
  id: string;
  email: string | null;
  fullName: string | null;
  roles: AppRole[];
  disabled: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

function errText(e: unknown) {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/^Error:\s*/, "");
}

function UsersPage() {
  const { roles, loading: authLoading } = useAuth();
  const isDeveloper = roles.includes("developer");
  const isAdmin = roles.includes("admin");
  const allowed = isDeveloper || isAdmin;

  const fetchList = useServerFn(listAccounts);
  const doCreate = useServerFn(createAccount);
  const doUpdate = useServerFn(updateAccount);
  const doRoles = useServerFn(setAccountRoles);
  const doPassword = useServerFn(setAccountPassword);
  const doReset = useServerFn(resetAccountPassword);

  const doDisabled = useServerFn(setAccountDisabled);
  const doDelete = useServerFn(deleteAccount);

  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", fullName: "", roles: ["student"] as AppRole[] });

  const [pwdTarget, setPwdTarget] = useState<Account | null>(null);
  const [resetResult, setResetResult] = useState<{
    email: string | null;
    password: string;
    emailSent: boolean;
    emailError: string | null;
  } | null>(null);

  const [newPwd, setNewPwd] = useState("");
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await fetchList({})) as Account[];
      setRows(data);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setLoading(false);
    }
  }, [fetchList]);

  useEffect(() => {
    if (allowed) void refresh();
  }, [allowed, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.fullName ?? "").toLowerCase().includes(q) ||
        r.roles.some((x) => x.includes(q)),
    );
  }, [rows, query]);

  // Two accounts on different mail domains can share the same short username
  // (admin@gmail.com / admin@idaroom.dz) — those must sign in with the full email.
  const duplicateUsernames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      const local = (r.email ?? "").split("@")[0]?.toLowerCase();
      if (local) seen.set(local, (seen.get(local) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [rows]);

  const run = async (id: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(okMsg);
      await refresh();
      return true;
    } catch (e) {
      toast.error(errText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (authLoading) {
    return (
      <div className="grid place-items-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card className="border-destructive/40">
          <CardHeader className="flex-row items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <CardTitle>الوصول مرفوض</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            هذه الصفحة مخصّصة لمدير النظام والمبرّمج فقط. إذا كنت تعتقد أن هذا خطأ، تواصل مع المبرّمج
            المسؤول عن المنصّة.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="إدارة الحسابات والأدوار"
        description="إنشاء الحسابات، تعديل المعلومات، منح أو سحب الأدوار والصلاحيات، تغيير كلمات المرور، التعطيل والحذف."
        icon={<UserCog className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span className="ms-2">تحديث</span>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="ms-2">حساب جديد</span>
            </Button>
          </>
        }
      />

      {!isDeveloper && (
        <p className="mb-4 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-muted-foreground">
          أنت مسجّل كمدير نظام: يمكنك إدارة كل الحسابات العادية، لكن منح أو سحب دور المبرّمج — أو
          تعديل حساب يملكه — محجوز للمبرّمج وحده.
        </p>
      )}

      <Input
        placeholder="بحث بالبريد أو الاسم أو الدور…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 max-w-sm"
      />

      <div className="space-y-3">
        {filtered.map((acc) => {
          const locked = !isDeveloper && acc.roles.includes("developer");
          return (
            <Card key={acc.id} className={locked ? "opacity-70" : undefined}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-[240px] space-y-2">
                  <div className="font-semibold">{acc.fullName ?? "بدون اسم"}</div>
                  <div className="text-sm text-muted-foreground">{acc.email}</div>
                  <div className="text-xs text-muted-foreground">
                    اسم الدخول:{" "}
                    <span className="font-mono">
                      {duplicateUsernames.has((acc.email ?? "").split("@")[0]?.toLowerCase() ?? "")
                        ? acc.email
                        : ((acc.email ?? "").split("@")[0] ?? "")}
                    </span>
                    {duplicateUsernames.has((acc.email ?? "").split("@")[0]?.toLowerCase() ?? "") && (
                      <span className="ms-1 text-destructive">(اسم مكرّر — استعمل البريد كاملًا)</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {acc.roles.length === 0 && <Badge variant="outline">بدون دور</Badge>}
                    {acc.roles.map((r) => (
                      <Badge key={r} variant={r === "developer" ? "default" : "secondary"}>
                        {ROLE_LABEL[r] ?? r}
                      </Badge>
                    ))}
                    {acc.disabled && <Badge variant="destructive">معطّل</Badge>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {ALL_ROLES.map((r) => {
                      const checked = acc.roles.includes(r);
                      const disabled =
                        locked || busy === acc.id || (r === "developer" && !isDeveloper);
                      return (
                        <label
                          key={r}
                          className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(v) => {
                              const next = v
                                ? [...acc.roles, r]
                                : acc.roles.filter((x) => x !== r);
                              void run(
                                acc.id,
                                () => doRoles({ data: { userId: acc.id, roles: next } }),
                                "تم تحديث الأدوار",
                              );
                            }}
                          />
                          {ROLE_LABEL[r]}
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex flex-col items-stretch gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={locked || busy === acc.id}
                      onClick={() => {
                        setEditTarget(acc);
                        setEditName(acc.fullName ?? "");
                        setEditEmail(acc.email ?? "");
                      }}
                    >
                      تعديل المعلومات
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={locked || busy === acc.id}
                      onClick={() => {
                        setPwdTarget(acc);
                        setNewPwd("");
                      }}
                    >
                      <KeyRound className="h-4 w-4" />
                      <span className="ms-2">كلمة المرور</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={locked || busy === acc.id}
                      onClick={() => {
                        if (
                          !confirm(
                            `إعادة تعيين كلمة مرور ${acc.email}؟ ستُنشأ كلمة مرور مؤقّتة وتُرسَل له رسالة لتغييرها.`,
                          )
                        )
                          return;
                        void (async () => {
                          setBusy(acc.id);
                          try {
                            const res = (await doReset({ data: { userId: acc.id } })) as {
                              email: string | null;
                              password: string;
                              emailSent: boolean;
                              emailError: string | null;
                            };
                            setResetResult(res);
                            toast.success("تمت إعادة تعيين كلمة المرور");
                          } catch (e) {
                            toast.error(errText(e));
                          } finally {
                            setBusy(null);
                          }
                        })();
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span className="ms-2">إعادة تعيين</span>
                    </Button>


                    <label className="flex items-center justify-between gap-2 text-sm">
                      <span>مفعّل</span>
                      <Switch
                        checked={!acc.disabled}
                        disabled={locked || busy === acc.id}
                        onCheckedChange={(v) =>
                          void run(
                            acc.id,
                            () => doDisabled({ data: { userId: acc.id, disabled: !v } }),
                            v ? "تم تفعيل الحساب" : "تم تعطيل الحساب",
                          )
                        }
                      />
                    </label>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={locked || busy === acc.id}
                      onClick={() => {
                        if (!confirm(`حذف الحساب ${acc.email}؟ لا يمكن التراجع.`)) return;
                        void run(acc.id, () => doDelete({ data: { userId: acc.id } }), "تم حذف الحساب");
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="ms-2">حذف</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!loading && filtered.length === 0 && (
          <p className="py-10 text-center text-muted-foreground">لا توجد حسابات مطابقة.</p>
        )}
      </div>

      {/* create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حساب جديد</DialogTitle>
            <DialogDescription>يُنشأ الحساب مؤكَّدًا ويمكنه الدخول فورًا.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>الاسم الكامل</Label>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>كلمة المرور (8 أحرف على الأقل)</Label>
              <Input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>الأدوار</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map((r) => (
                  <label
                    key={r}
                    className={`flex items-center gap-2 text-sm ${r === "developer" && !isDeveloper ? "opacity-50" : "cursor-pointer"}`}
                  >
                    <Checkbox
                      checked={form.roles.includes(r)}
                      disabled={r === "developer" && !isDeveloper}
                      onCheckedChange={(v) =>
                        setForm({
                          ...form,
                          roles: v ? [...form.roles, r] : form.roles.filter((x) => x !== r),
                        })
                      }
                    />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={busy === "new"}
              onClick={async () => {
                const ok = await run("new", () => doCreate({ data: form }), "تم إنشاء الحساب");
                if (ok) {
                  setCreateOpen(false);
                  setForm({ email: "", password: "", fullName: "", roles: ["student"] });
                }
              }}
            >
              إنشاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* edit info */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل معلومات الحساب</DialogTitle>
            <DialogDescription>{editTarget?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>الاسم الكامل</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!editTarget) return;
                const ok = await run(
                  editTarget.id,
                  () =>
                    doUpdate({
                      data: {
                        userId: editTarget.id,
                        fullName: editName || undefined,
                        email: editEmail || undefined,
                      },
                    }),
                  "تم حفظ التعديلات",
                );
                if (ok) setEditTarget(null);
              }}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* temporary password result */}
      <Dialog open={!!resetResult} onOpenChange={(o) => !o && setResetResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>كلمة مرور مؤقّتة</DialogTitle>
            <DialogDescription>{resetResult?.email ?? "—"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input readOnly value={resetResult?.password ?? ""} className="font-mono tracking-wider" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(resetResult?.password ?? "");
                  toast.success("تم نسخ كلمة المرور");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {resetResult?.emailSent ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MailCheck className="h-4 w-4" />
                أُرسلت رسالة إلى المستخدم لتعيين كلمة مرور جديدة.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                تعذّر إرسال الرسالة تلقائيًا{resetResult?.emailError ? ` (${resetResult.emailError})` : ""}؛ سلّم كلمة
                المرور المؤقّتة للمستخدم بنفسك.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              هذه الكلمة تظهر مرة واحدة فقط — انسخها الآن، ويُستحسن أن يغيّرها المستخدم بعد أول دخول.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setResetResult(null)}>تم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* password */}

      <Dialog open={!!pwdTarget} onOpenChange={(o) => !o && setPwdTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور</DialogTitle>
            <DialogDescription>{pwdTarget?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>كلمة المرور الجديدة (8 أحرف على الأقل)</Label>
            <Input value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!pwdTarget) return;
                const ok = await run(
                  pwdTarget.id,
                  () => doPassword({ data: { userId: pwdTarget.id, password: newPwd } }),
                  "تم تغيير كلمة المرور",
                );
                if (ok) setPwdTarget(null);
              }}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
