/**
 * Client-side parser for bulk-import files.
 * Supports: .xlsx, .xls, .csv, .txt, .docx, .pdf
 * Returns raw rows (array of objects with normalized keys).
 */

export type ParsedRow = {
  full_name: string;
  email?: string;
  phone?: string;
  gender?: "M" | "F";
  date_of_birth?: string;
  class_name?: string;
};

const HEADER_MAP: Record<string, keyof ParsedRow> = {
  // Arabic
  الاسم: "full_name",
  "الاسم الكامل": "full_name",
  اسم: "full_name",
  البريد: "email",
  "البريد الإلكتروني": "email",
  الايميل: "email",
  الهاتف: "phone",
  رقم: "phone",
  "رقم الهاتف": "phone",
  الجنس: "gender",
  تاريخ_الميلاد: "date_of_birth",
  "تاريخ الميلاد": "date_of_birth",
  القسم: "class_name",
  الفصل: "class_name",
  الفوج: "class_name",
  // French
  nom: "full_name",
  "nom complet": "full_name",
  email: "email",
  courriel: "email",
  telephone: "phone",
  téléphone: "phone",
  tel: "phone",
  genre: "gender",
  sexe: "gender",
  "date de naissance": "date_of_birth",
  ddn: "date_of_birth",
  classe: "class_name",
  groupe: "class_name",
  // English
  name: "full_name",
  full_name: "full_name",
  fullname: "full_name",
  phone: "phone",
  mobile: "phone",
  gender: "gender",
  dob: "date_of_birth",
  birthdate: "date_of_birth",
  "date of birth": "date_of_birth",
  class: "class_name",
  classroom: "class_name",
  group: "class_name",
};

function normHeader(h: string): keyof ParsedRow | null {
  const key = h.trim().toLowerCase().replace(/\s+/g, " ");
  return HEADER_MAP[key] ?? HEADER_MAP[key.replace(/ /g, "_")] ?? null;
}

function normalizeGender(v: string): "M" | "F" | undefined {
  const s = v.trim().toLowerCase();
  if (["m", "male", "ذكر", "garçon", "garcon", "h", "homme"].includes(s)) return "M";
  if (["f", "female", "أنثى", "انثى", "fille", "femme"].includes(s)) return "F";
  return undefined;
}

function rowsFromMatrix(matrix: string[][]): ParsedRow[] {
  if (matrix.length === 0) return [];
  // Detect header row: first row where at least one cell maps to a known header
  let headerIdx = 0;
  for (let i = 0; i < Math.min(matrix.length, 3); i++) {
    if (matrix[i].some((c) => c && normHeader(c))) {
      headerIdx = i;
      break;
    }
  }
  const header = matrix[headerIdx];
  const mapped = header.map((h) => normHeader(String(h ?? "")));
  const hasHeader = mapped.some((m) => m !== null);

  const rows: ParsedRow[] = [];
  const start = hasHeader ? headerIdx + 1 : 0;
  for (let r = start; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => !c || String(c).trim() === "")) continue;
    const obj: Partial<ParsedRow> = {};
    if (hasHeader) {
      row.forEach((cell, i) => {
        const key = mapped[i];
        if (!key || cell == null) return;
        const val = String(cell).trim();
        if (!val) return;
        if (key === "gender") obj.gender = normalizeGender(val);
        else obj[key] = val as never;
      });
    } else {
      // No header: assume single column of names, or "name, email, phone"
      const [nm, em, ph, gd, dob, cls] = row.map((c) => (c == null ? "" : String(c).trim()));
      if (nm) obj.full_name = nm;
      if (em) obj.email = em;
      if (ph) obj.phone = ph;
      if (gd) obj.gender = normalizeGender(gd);
      if (dob) obj.date_of_birth = dob;
      if (cls) obj.class_name = cls;
    }
    if (obj.full_name && obj.full_name.length >= 2) rows.push(obj as ParsedRow);
  }
  return rows;
}

function textToRows(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[-=_*]+$/.test(l));
  // If a line contains tabs or commas or semicolons, treat as delimited
  const delim = /[\t;,]/.test(lines[0] ?? "") ? /[\t;,]/ : null;
  const matrix = lines.map((l) => (delim ? l.split(delim).map((c) => c.trim()) : [l]));
  return rowsFromMatrix(matrix);
}

export async function parseImportFile(file: File): Promise<ParsedRow[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
    return rowsFromMatrix(matrix.map((r) => r.map((c) => (c == null ? "" : String(c)))));
  }

  if (name.endsWith(".csv")) {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    return rowsFromMatrix(parsed.data as string[][]);
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return textToRows(res.value);
  }

  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = "";
    const buf = await file.arrayBuffer();
    const pdf = await (pdfjs.getDocument as unknown as (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }> }> })({ data: buf, isEvalSupported: false, useWorkerFetch: false, disableWorker: true }).promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const strs = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      text += strs + "\n";
    }
    return textToRows(text);
  }

  // Default: plain text
  const text = await file.text();
  return textToRows(text);
}
