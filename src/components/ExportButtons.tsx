import { FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportToExcel } from "@/lib/export-utils";

/** Excel download + browser print for any list of flat rows (keys = Arabic column headers). */
export function ExportButtons({
  filename,
  title,
  rows,
}: {
  filename: string;
  title: string;
  rows: Record<string, string | number | null | undefined>[];
}) {
  const excel = async () => {
    if (!rows.length) return toast.error("لا توجد بيانات للتصدير");
    await exportToExcel(`${filename}-${new Date().toISOString().slice(0, 10)}`, rows, "data");
  };

  const print = () => {
    if (!rows.length) return toast.error("لا توجد بيانات للطباعة");
    const cols = Object.keys(rows[0]);
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:system-ui,Tahoma,sans-serif;margin:24px}h1{font-size:18px}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #999;padding:4px 6px;text-align:right}
th{background:#eee}.m{color:#555;font-size:11px;margin-bottom:8px}</style></head><body>
<h1>${esc(title)}</h1><div class="m">تاريخ الطباعة: ${new Date().toLocaleString("ar-DZ")} — عدد السطور: ${rows.length}</div>
<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}
</tbody></table><script>window.onload=()=>{window.print()}</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("اسمح بفتح النوافذ المنبثقة للطباعة");
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={excel}>
        <FileSpreadsheet className="me-1 h-4 w-4" /> Excel
      </Button>
      <Button size="sm" variant="outline" onClick={print}>
        <Printer className="me-1 h-4 w-4" /> طباعة
      </Button>
    </div>
  );
}
