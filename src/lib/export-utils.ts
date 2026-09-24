/**
 * Lazy-loaded export helpers. Keeps xlsx/jspdf out of the main bundle.
 */

export async function exportToExcel(
  filename: string,
  rows: Record<string, unknown>[],
  sheetName = "Sheet1",
) {
  if (!rows.length) return;
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export async function exportToPdf(
  filename: string,
  title: string,
  columns: string[],
  rows: (string | number)[][],
) {
  const { default: jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = (autoTableMod as { default: (doc: unknown, opts: unknown) => void }).default;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: 22,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [194, 65, 12] },
  });
  doc.save(`${filename}.pdf`);
}
