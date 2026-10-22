import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ParentLinkDialog } from "@/components/ParentLinkDialog";
import { PageHeader } from "@/components/PageHeader";
import { exportToExcel, exportToPdf } from "@/lib/export-utils";

export const Route = createFileRoute("/dashboard/students")({
  head: () => ({
    meta: [
      { title: "قائمة التلاميذ — إداروم" },
      { name: "description", content: "إداروم: قائمة التلاميذ في الثانوية الجزائرية." },
      { property: "og:title", content: "قائمة التلاميذ — إداروم" },
      { property: "og:description", content: "إداروم: قائمة التلاميذ في الثانوية الجزائرية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentsPage,
});

type Row = {
  id: string;
  full_name: string;
  gender: "M" | "F" | null;
  date_of_birth: string | null;
  fake_email: string | null;
  fake_phone: string | null;
  classes: { name: string } | null;
};

function StudentsPage() {
  useRealtimeTable("students", ["students"]);
  useRealtimeTable("classes", ["students"]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["students"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, gender, date_of_birth, fake_email, fake_phone, classes(name)")
        .order("full_name");
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });

  const byClass = (data ?? []).reduce<Record<string, Row[]>>((acc, r) => {
    const k = r.classes?.name ?? "—";
    (acc[k] ||= []).push(r);
    return acc;
  }, {});

  const buildExportRows = () =>
    (data ?? []).map((r) => ({
      "الاسم واللقب": r.full_name,
      القسم: r.classes?.name ?? "",
      الجنس: r.gender === "M" ? "ذكر" : r.gender === "F" ? "أنثى" : "",
      "تاريخ الميلاد": r.date_of_birth ?? "",
      البريد: r.fake_email ?? "",
      الهاتف: r.fake_phone ?? "",
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="قائمة التلاميذ"
        description={`البيانات تتحدّث فورياً — المجموع: ${data?.length ?? 0}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => exportToExcel("students", buildExportRows())}
              disabled={!data?.length}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                exportToPdf(
                  "students",
                  "قائمة التلاميذ",
                  ["Name", "Class", "Gender", "DOB", "Email", "Phone"],
                  (data ?? []).map((r) => [
                    r.full_name,
                    r.classes?.name ?? "",
                    r.gender ?? "",
                    r.date_of_birth ?? "",
                    r.fake_email ?? "",
                    r.fake_phone ?? "",
                  ]),
                )
              }
              disabled={!data?.length}
            >
              <FileText className="h-4 w-4" />
              PDF
            </Button>
          </>
        }
      />

      {isLoading && <p className="text-muted-foreground">جارٍ التحميل...</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}

      {Object.entries(byClass).map(([className, rows]) => (
        <Card key={className}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{className}</CardTitle>
            <Badge variant="secondary">{rows.length} تلميذ</Badge>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم واللقب</TableHead>
                  <TableHead>الجنس</TableHead>
                  <TableHead>تاريخ الميلاد</TableHead>
                  <TableHead>البريد (تجريبي)</TableHead>
                  <TableHead>الهاتف (تجريبي)</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell>{r.gender === "M" ? "ذكر" : "أنثى"}</TableCell>
                    <TableCell>{r.date_of_birth ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.fake_email}</TableCell>
                    <TableCell className="text-xs ltr">{r.fake_phone}</TableCell>
                    <TableCell className="text-end">
                      <ParentLinkDialog studentId={r.id} studentName={r.full_name} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
