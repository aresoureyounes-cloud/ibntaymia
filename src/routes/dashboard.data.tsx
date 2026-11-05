import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Search, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/use-auth";
import { DATA_TABLES } from "@/lib/data-explorer";
import { listRows, saveRow, deleteRow, listAccounts, updateAccount } from "@/lib/data-explorer.functions";

export const Route = createFileRoute("/dashboard/data")({
  head: () => ({
    meta: [
      { title: "مستكشف البيانات — إداروم" },
      { name: "description", content: "تصفح وتعديل بيانات المؤسسة: التلاميذ والأساتذة والحضور والبرنامج والحسابات." },
      { property: "og:title", content: "مستكشف البيانات — إداروم" },
      { property: "og:description", content: "تصفح وتعديل بيانات المؤسسة من مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataPage,
});

const PAGE = 50;

function DataPage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<string>("students");
  if (!hasRole("admin") && !hasRole("developer"))
    return <p className="p-6 text-muted-foreground">هذه الصفحة للمسؤول أو المبرمج فقط.</p>;
  return (
    <div className="space-y-4">
      <PageHeader title="مستكشف البيانات" description="تصفح كل بيانات المؤسسة وعدّلها. كل تعديل يُسجَّل باسمك." />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={tab === "__accounts" ? "default" : "outline"} onClick={() => setTab("__accounts")}>
          <KeyRound className="h-4 w-4" /> الحسابات وتسجيلات الدخول
        </Button>
        {DATA_TABLES.map((t) => (
          <Button key={t.name} size="sm" variant={tab === t.name ? "default" : "outline"} onClick={() => setTab(t.name)}>
            {t.label}
          </Button>
        ))}
      </div>
      {tab === "__accounts" ? <Accounts /> : <TableView key={tab} table={tab} />}
    </div>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  const s = String(v);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

function TableView({ table }: { table: string }) {
  const meta = DATA_TABLES.find((t) => t.name === table)!;
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const qc = useQueryClient();
  const list = useServerFn(listRows);
  const del = useServerFn(deleteRow);
  const { data, isLoading, error } = useQuery({
    queryKey: ["data-explorer", table, q, page],
    queryFn: () => list({ data: { table, search: q, page, pageSize: PAGE } }),
  });
  const rows = data?.rows ?? [];
  const cols = rows[0] ? Object.keys(rows[0]) : [];

  async function remove(id: string) {
    if (!confirm("حذف هذا السجل نهائياً؟")) return;
    try {
      await del({ data: { table, id } });
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["data-explorer", table] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(0); setQ(search); }}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث…" />
          <Button type="submit" variant="outline"><Search className="h-4 w-4" /></Button>
          {!meta.readOnly && (
            <Button type="button" onClick={() => setEditing({})}><Plus className="h-4 w-4" /> إضافة</Button>
          )}
        </form>
        <div className="text-sm text-muted-foreground">
          {data ? `${data.count} سجل` : ""} {meta.readOnly && <Badge variant="secondary">قراءة فقط</Badge>}
        </div>
        {error && <p className="text-destructive">{(error as Error).message}</p>}
        {isLoading ? <p>جارٍ التحميل…</p> : rows.length === 0 ? <p className="text-muted-foreground">لا توجد سجلات.</p> : (
          <div className="overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2" />
                  {cols.map((c) => <th key={c} className="whitespace-nowrap p-2 text-start">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r[meta.key])} className="border-t">
                    <td className="whitespace-nowrap p-1">
                      {!meta.readOnly && (
                        <Button size="icon" variant="ghost" onClick={() => setEditing(r)} aria-label="تعديل"><Pencil className="h-4 w-4" /></Button>
                      )}
                      {!meta.readOnly && !meta.noDelete && (
                        <Button size="icon" variant="ghost" onClick={() => remove(String(r[meta.key]))} aria-label="حذف"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </td>
                    {cols.map((c) => <td key={c} className="whitespace-nowrap p-2">{fmt(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button>
          <span className="text-sm">صفحة {page + 1}</span>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= (data?.count ?? 0)} onClick={() => setPage(page + 1)}>التالي</Button>
        </div>
      </CardContent>
      {editing && (
        <RowEditor table={table} row={editing} columns={cols} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["data-explorer", table] }); }} />
      )}
    </Card>
  );
}

const SKIP = new Set(["id", "created_at", "updated_at"]);

function RowEditor({ table, row, columns, onClose, onSaved }: {
  table: string; row: Record<string, unknown>; columns: string[]; onClose: () => void; onSaved: () => void;
}) {
  const meta = DATA_TABLES.find((t) => t.name === table)!;
  const isNew = row[meta.key] === undefined;
  const fields = columns.filter((c) => !SKIP.has(c));
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((c) => {
      const v = row[c];
      return [c, v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)];
    })),
  );
  const [saving, setSaving] = useState(false);
  const save = useServerFn(saveRow);

  async function submit() {
    setSaving(true);
    try {
      const values: Record<string, unknown> = {};
      for (const c of fields) {
        const s = vals[c];
        const orig = row[c];
        if (s === "") { if (!isNew) values[c] = null; continue; }
        if (typeof orig === "object" && orig !== null) values[c] = JSON.parse(s);
        else if (typeof orig === "boolean" || s === "true" || s === "false") values[c] = s === "true";
        else if (typeof orig === "number") values[c] = Number(s);
        else values[c] = s;
      }
      await save({ data: { table, id: isNew ? undefined : String(row[meta.key]), values } });
      toast.success("تم الحفظ");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-auto">
        <DialogHeader><DialogTitle>{isNew ? "إضافة" : "تعديل"} — {meta.label}</DialogTitle></DialogHeader>
        {fields.length === 0 && <p className="text-sm text-muted-foreground">لا توجد سجلات لمعرفة الحقول؛ أضف من الصفحة المختصة أولاً.</p>}
        <div className="space-y-2">
          {fields.map((c) => (
            <label key={c} className="block text-xs">
              <span className="text-muted-foreground">{c}</span>
              {vals[c].length > 60
                ? <Textarea value={vals[c]} onChange={(e) => setVals({ ...vals, [c]: e.target.value })} />
                : <Input value={vals[c]} onChange={(e) => setVals({ ...vals, [c]: e.target.value })} />}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={saving || fields.length === 0}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Account = Awaited<ReturnType<typeof listAccounts>>[number];

function Accounts() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Account | null>(null);
  const list = useServerFn(listAccounts);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["data-explorer-accounts"],
    queryFn: () => list({ data: { search: "" } }),
  });
  const s = search.toLowerCase();
  const rows = (data ?? []).filter((u) => !s || u.email.toLowerCase().includes(s) || u.full_name.toLowerCase().includes(s));
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد…" />
        {error && <p className="text-destructive">{(error as Error).message}</p>}
        {isLoading ? <p>جارٍ التحميل…</p> : (
          <div className="overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr>
                <th className="p-2 text-start">الاسم</th><th className="p-2 text-start">البريد</th>
                <th className="p-2 text-start">الأدوار</th><th className="p-2 text-start">آخر دخول</th><th />
              </tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="p-2">{u.full_name || "—"}</td>
                    <td className="p-2" dir="ltr">{u.email}</td>
                    <td className="p-2">{u.roles.map((r) => <Badge key={r} variant="secondary" className="me-1">{r}</Badge>)}</td>
                    <td className="p-2">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("ar-DZ") : "لم يدخل"}</td>
                    <td className="p-2"><Button size="sm" variant="outline" onClick={() => setEditing(u)}>تعديل</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">لتغيير الأدوار استعمل صفحة المستخدمين.</p>
      </CardContent>
      {editing && <AccountEditor acc={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["data-explorer-accounts"] }); }} />}
    </Card>
  );
}

function AccountEditor({ acc, onClose, onSaved }: { acc: Account; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState(acc.email);
  const [name, setName] = useState(acc.full_name);
  const [phone, setPhone] = useState(acc.phone);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const save = useServerFn(updateAccount);
  async function submit() {
    setSaving(true);
    try {
      await save({ data: {
        userId: acc.id,
        email: email !== acc.email ? email : undefined,
        password: password || undefined,
        full_name: name, phone,
      } });
      toast.success("تم تحديث الحساب");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>تعديل الحساب</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الكامل" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد" dir="ltr" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="الهاتف" dir="ltr" />
          <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة مرور جديدة (اختياري، 8 أحرف على الأقل)" type="password" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
