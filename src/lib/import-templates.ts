/**
 * Downloadable Excel/CSV templates for the bulk-import page.
 * Columns and sample rows are chosen to match `parseImportFile` header aliases
 * so the file can be re-uploaded as-is.
 */

export type TemplateKind =
  | "student"
  | "teacher"
  | "admin"
  | "director"
  | "supervisor"
  | "gate_monitor"
  | "parent"
  | "editor";

type Template = {
  headers: string[];
  samples: Record<string, string>[];
  sheetName: string;
};

const STUDENT: Template = {
  sheetName: "students",
  headers: ["الاسم", "البريد", "الهاتف", "الجنس", "تاريخ الميلاد", "القسم"],
  samples: [
    {
      الاسم: "أحمد بن علي",
      البريد: "ahmed.benali@example.com",
      الهاتف: "0550123456",
      الجنس: "M",
      "تاريخ الميلاد": "2012-03-15",
      القسم: "1م1",
    },
    {
      الاسم: "فاطمة الزهراء",
      البريد: "",
      الهاتف: "0661987654",
      الجنس: "F",
      "تاريخ الميلاد": "2012-07-02",
      القسم: "1م1",
    },
    {
      الاسم: "يوسف مرابط",
      البريد: "",
      الهاتف: "",
      الجنس: "M",
      "تاريخ الميلاد": "2011-11-20",
      القسم: "2م2",
    },
  ],
};

const TEACHER: Template = {
  sheetName: "teachers",
  headers: ["الاسم", "البريد", "الهاتف", "الجنس"],
  samples: [
    {
      الاسم: "الأستاذ محمد بلقاسم",
      البريد: "m.belkacem@example.com",
      الهاتف: "0770112233",
      الجنس: "M",
    },
    {
      الاسم: "الأستاذة نور الهدى",
      البريد: "n.houda@example.com",
      الهاتف: "0555667788",
      الجنس: "F",
    },
  ],
};

const STAFF: Template = {
  sheetName: "staff",
  headers: ["الاسم", "البريد", "الهاتف"],
  samples: [
    {
      الاسم: "المدير كمال بوزيان",
      البريد: "k.bouzian@example.com",
      الهاتف: "0770000001",
    },
    {
      الاسم: "الناظر سليم شريف",
      البريد: "s.cherif@example.com",
      الهاتف: "0770000002",
    },
  ],
};

const PARENT: Template = {
  sheetName: "parents",
  headers: ["الاسم", "البريد", "الهاتف"],
  samples: [
    {
      الاسم: "ولي الأمر: علي بن أحمد",
      البريد: "parent1@example.com",
      الهاتف: "0550000001",
    },
  ],
};

export function getTemplate(kind: TemplateKind): Template {
  switch (kind) {
    case "student":
      return STUDENT;
    case "teacher":
      return TEACHER;
    case "parent":
      return PARENT;
    case "admin":
    case "director":
    case "supervisor":
    case "editor":
    case "gate_monitor":
      return STAFF;
  }
}

export async function downloadTemplateExcel(kind: TemplateKind) {
  const tpl = getTemplate(kind);
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(tpl.samples, { header: tpl.headers });
  // Reasonable column widths
  ws["!cols"] = tpl.headers.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tpl.sheetName);
  XLSX.writeFile(wb, `idaroom-template-${kind}.xlsx`);
}

export function downloadTemplateCsv(kind: TemplateKind) {
  const tpl = getTemplate(kind);
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [
    tpl.headers.join(","),
    ...tpl.samples.map((r) => tpl.headers.map((h) => escape(r[h] ?? "")).join(",")),
  ];
  // BOM so Excel opens Arabic UTF-8 correctly
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `idaroom-template-${kind}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
