import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, XCircle, Download, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/lib/use-auth";
import { parseImportFile, type ParsedRow } from "@/lib/parse-import-file";
import { bulkImportAccounts } from "@/lib/bulk-import.functions";
import { exportToExcel } from "@/lib/export-utils";
import { downloadTemplateExcel, downloadTemplateCsv } from "@/lib/import-templates";

export const Route = createFileRoute("/dashboard/import")({
  component: ImportPage,
});

type Kind =
  | "student"
  | "teacher"
  | "admin"
  | "director"
  | "supervisor"
  | "gate_monitor"
  | "parent"
  | "editor";

type ResultRow = {
  full_name: string;
  email: string | null;
  password: string | null;
  badge_uid: string | null;
  status: "created" | "existed" | "error";
  error?: string;
};

function ImportPage() {
  const { roles } = useAuth();
  const importFn = useServerFn(bulkImportAccounts);

  const [kind, setKind] = useState<Kind>("student");
  const [createBadge, setCreateBadge] = useState(true);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);

  const isAdmin = roles.includes("admin") || roles.includes("developer");
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <Card>
          <CardHeader>
            <CardTitle>غير مصرح</CardTitle>
          </CardHeader>
          <CardContent>هذه الصفحة متاحة للمدير العام فقط.</CardContent>
        </Card>
      </div>
    );
  }

  async function handleFile(file: File) {
    setParsing(true);
    setResults([]);
    try {
      const parsed = await parseImportFile(file);
      if (parsed.length === 0) {
        toast.error("لم يتم العثور على أي صفوف صالحة في الملف");
      } else {
        toast.success(`تم استخراج ${parsed.length} صف`);
      }
      setRows(parsed);
      setFileName(file.name);
    } catch (e) {
      toast.error(`فشل قراءة الملف: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit() {
    if (rows.length === 0) return;
    setSubmitting(true);
    try {
      const res = await importFn({
        data: { kind, create_badge: createBadge, rows },
      });
      setResults(res.results);
      const created = res.results.filter((r) => r.status === "created").length;
      const existed = res.results.filter((r) => r.status === "existed").length;
      const errored = res.results.filter((r) => r.status === "error").length;
      toast.success(`تم: ${created} جديد · ${existed} موجود · ${errored} خطأ`);
    } catch (e) {
      toast.error(`فشل الإنشاء: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  function updateRow(i: number, field: keyof ParsedRow, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value || undefined };
      return next;
    });
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function downloadResults() {
    await exportToExcel(
      `accounts-${kind}-${Date.now()}`,
      results.map((r) => ({
        الاسم: r.full_name,
        البريد: r.email ?? "",
        "كلمة السر": r.password ?? "(موجود مسبقاً)",
        الباج: r.badge_uid ?? "",
        الحالة: r.status,
        الخطأ: r.error ?? "",
      })),
      "accounts",
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <PageHeader
        title="استيراد الحسابات من ملف"
        description="ارفع ملف (Excel, CSV, Word, PDF, Text) يحتوي على قائمة الأشخاص، وسننشئ حسابات وبادجات لهم دفعة واحدة."
      />

      <Card>
        <CardHeader>
          <CardTitle>1. اختر نوع الحسابات والملف</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>نوع الحساب</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">تلاميذ (Students)</SelectItem>
                  <SelectItem value="teacher">معلمون (Teachers)</SelectItem>
                  <SelectItem value="supervisor">ناظر / مشرف</SelectItem>
                  <SelectItem value="director">مدير</SelectItem>
                  <SelectItem value="admin">أدمن</SelectItem>
                  <SelectItem value="editor">Editor (يُمنح صلاحيات مشرف)</SelectItem>
                  <SelectItem value="gate_monitor">حارس البوابة</SelectItem>
                  <SelectItem value="parent">ولي أمر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
                <Checkbox
                  checked={createBadge}
                  onCheckedChange={(v) => setCreateBadge(v === true)}
                />
                إنشاء بادج (Badge) لكل حساب
              </label>
            </div>
          </div>

          <div className="rounded-md border-2 border-dashed border-input p-6 text-center">
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="mb-3 text-sm text-muted-foreground">
              الصيغ المدعومة: .xlsx .xls .csv .txt .docx .pdf
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.docx,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              disabled={parsing}
            />
            {fileName && (
              <p className="mt-2 text-xs text-muted-foreground">
                <FileText className="me-1 inline h-3 w-3" />
                {fileName}
              </p>
            )}
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium">الأعمدة المتعرف عليها (اختيارية عدا الاسم):</p>
            <code>الاسم / name</code> · <code>البريد / email</code> ·{" "}
            <code>الهاتف / phone</code> · <code>الجنس / gender (M/F)</code> ·{" "}
            <code>تاريخ الميلاد / dob</code> · <code>القسم / class</code>
          </div>

          <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
            <p className="mb-2 text-sm font-medium">
              📥 حمّل قالب جاهز ({kind}) وابدأ التعبئة مباشرة:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => downloadTemplateExcel(kind)}
              >
                <Download className="me-1 h-4 w-4" />
                قالب Excel (.xlsx)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => downloadTemplateCsv(kind)}
              >
                <Download className="me-1 h-4 w-4" />
                قالب CSV (.csv)
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              القالب يحتوي على أعمدة مطلوبة + صفوف عينة صحيحة — احذف العينات ثم أضف بياناتك ثم ارفع الملف.
            </p>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>2. معاينة ({rows.length} صف)</CardTitle>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="me-2 h-4 w-4" />
              )}
              إنشاء الحسابات
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>البريد</TableHead>
                    <TableHead>الهاتف</TableHead>
                    {kind === "student" && <TableHead>القسم</TableHead>}
                    {kind === "student" && <TableHead>الجنس</TableHead>}
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input
                          value={r.full_name}
                          onChange={(e) => updateRow(i, "full_name", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.email ?? ""}
                          placeholder="(auto)"
                          onChange={(e) => updateRow(i, "email", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.phone ?? ""}
                          onChange={(e) => updateRow(i, "phone", e.target.value)}
                        />
                      </TableCell>
                      {kind === "student" && (
                        <TableCell>
                          <Input
                            value={r.class_name ?? ""}
                            onChange={(e) => updateRow(i, "class_name", e.target.value)}
                          />
                        </TableCell>
                      )}
                      {kind === "student" && (
                        <TableCell>
                          <Input
                            value={r.gender ?? ""}
                            placeholder="M/F"
                            onChange={(e) => updateRow(i, "gender", e.target.value)}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => removeRow(i)}>
                          حذف
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>3. النتائج</CardTitle>
            <Button variant="outline" size="sm" onClick={downloadResults}>
              <Download className="me-2 h-4 w-4" />
              تحميل Excel
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-[500px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>البريد</TableHead>
                    <TableHead>كلمة السر</TableHead>
                    <TableHead>الباج</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {r.status === "created" && (
                          <Badge variant="default">
                            <CheckCircle2 className="me-1 h-3 w-3" /> جديد
                          </Badge>
                        )}
                        {r.status === "existed" && <Badge variant="secondary">موجود</Badge>}
                        {r.status === "error" && (
                          <Badge variant="destructive" title={r.error}>
                            <XCircle className="me-1 h-3 w-3" /> خطأ
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{r.full_name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.email ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.password ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.badge_uid ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              ⚠️ احفظ كلمات السر الآن — لن تظهر مرة أخرى بعد مغادرة الصفحة.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
