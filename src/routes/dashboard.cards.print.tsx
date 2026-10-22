import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, ArrowRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { HandDrawnStar } from "@/components/HandDrawnStar";

export const Route = createFileRoute("/dashboard/cards/print")({
  head: () => ({
    meta: [
      { title: "طباعة البطاقات — إداروم" },
      { name: "description", content: "إداروم: طباعة البطاقات في الثانوية الجزائرية." },
      { property: "og:title", content: "طباعة البطاقات — إداروم" },
      { property: "og:description", content: "إداروم: طباعة البطاقات في الثانوية الجزائرية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CardsPrintPage,
});

type Row = {
  id: string;
  card_uid: string;
  students: { id: string; full_name: string; classes: { name: string } | null } | null;
};

function CardsPrintPage() {
  const [classFilter, setClassFilter] = useState<string>("");

  const { data: cards } = useQuery({
    queryKey: ["rfid_cards_print"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("rfid_cards")
        .select("id, card_uid, students(id, full_name, classes(name))")
        .not("student_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });

  const filtered = (cards ?? []).filter((c) => {
    if (!classFilter) return true;
    return c.students?.classes?.name === classFilter;
  });

  const classes = Array.from(
    new Set((cards ?? []).map((c) => c.students?.classes?.name).filter(Boolean) as string[]),
  );

  return (
    <div className="space-y-6">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard/cards">
              <ArrowRight className="h-4 w-4" />
              <span>العودة</span>
            </Link>
          </Button>
          <h1 className="font-display text-2xl">طباعة البطاقات</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">كل الأقسام</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" />
            طباعة ({filtered.length})
          </Button>
        </div>
      </div>

      <div className="print-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <PrintableCard
            key={c.id}
            uid={c.card_uid}
            studentName={c.students?.full_name ?? "—"}
            className={c.students?.classes?.name ?? "—"}
          />
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground">لا توجد بطاقات للطباعة.</p>}
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body * { visibility: hidden; }
          .print-grid, .print-grid * { visibility: visible; }
          .print-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; position: absolute; inset: 0; padding: 10mm; }
          .printable-card { break-inside: avoid; box-shadow: none !important; border: 1.5px dashed #888 !important; }
        }
      `}</style>
    </div>
  );
}

function PrintableCard({
  uid,
  studentName,
  className,
}: {
  uid: string;
  studentName: string;
  className: string;
}) {
  return (
    <div
      className="printable-card sketch-border bg-card grain relative flex flex-col justify-between p-4"
      style={{ width: "85.6mm", height: "54mm" }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-primary">
          <HandDrawnStar size={26} />
          <span className="font-display text-lg leading-none">إداروم</span>
        </div>
        <span className="rounded bg-secondary px-2 py-0.5 text-[10px] uppercase">RFID</span>
      </div>
      <div className="flex-1">
        <div className="font-display text-xl leading-tight">{studentName}</div>
        <div className="text-xs text-muted-foreground">{className}</div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="font-mono text-[10px] leading-tight">
          <div className="opacity-60">UID</div>
          <div className="break-all">{uid}</div>
        </div>
        <div className="rounded bg-background p-1">
          <QRCodeSVG value={uid} size={48} />
        </div>
      </div>
    </div>
  );
}
