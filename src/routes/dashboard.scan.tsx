import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Phone, MessageSquare, Search, Ticket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard/scan")({
  head: () => ({
    meta: [
      { title: "المسح السريع — إداروم" },
      { name: "description", content: "امسح بطاقة التلميذ بكاميرا الهاتف لعرض قسمه والاتصال بالأب أو الأم فوراً." },
      { property: "og:title", content: "المسح السريع — إداروم" },
      { property: "og:description", content: "مسح بطاقة التلميذ بالهاتف والاتصال بالولي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanPage,
});

type Student = {
  id: string; full_name: string; national_student_id: string | null; father_phone: string | null;
  mother_phone: string | null; guardian_name: string | null; enrollment_status: string; classes: { name: string } | null;
};
const COLS = "id, full_name, national_student_id, father_phone, mother_phone, guardian_name, enrollment_status, classes(name)";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

async function resolveCode(code: string): Promise<Student[]> {
  const c = code.trim();
  if (!c) return [];
  const { data: card } = await supabase.from("rfid_cards").select("student_id").eq("card_uid", c).maybeSingle();
  if (card?.student_id) {
    const { data } = await supabase.from("students").select(COLS).eq("id", card.student_id);
    return (data ?? []) as unknown as Student[];
  }
  const { data: byId } = await supabase.from("students").select(COLS).eq("national_student_id", c);
  if (byId?.length) return byId as unknown as Student[];
  const safe = c.replace(/[%,()]/g, " ");
  const { data } = await supabase.from("students").select(COLS).ilike("full_name", `%${safe}%`).limit(10);
  return (data ?? []) as unknown as Student[];
}

function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [supported, setSupported] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[] | null>(null);

  useEffect(() => {
    setSupported("BarcodeDetector" in window && !!navigator.mediaDevices);
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function lookup(code: string) {
    const r = await resolveCode(code);
    setResults(r);
    if (r.length) navigator.vibrate?.(80);
    else toast.error("لم يُعثر على تلميذ");
  }

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const Ctor = (window as unknown as { BarcodeDetector: new (o: object) => Detector }).BarcodeDetector;
      const detector = new Ctor({ formats: ["qr_code", "code_128", "ean_13"] });
      const loop = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) { stop(); setQuery(codes[0].rawValue); await lookup(codes[0].rawValue); return; }
        } catch { /* keep scanning */ }
        requestAnimationFrame(loop);
      };
      loop();
    } catch {
      toast.error("تعذر فتح الكاميرا — اسمح للموقع باستعمالها");
      stop();
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <PageHeader title="المسح السريع" description="ميزة الهاتف: امسح بطاقة التلميذ أو اكتب اسمه أو رقمه." />
      <Card>
        <CardContent className="space-y-3 pt-6">
          {supported ? (
            <Button className="w-full" size="lg" onClick={scanning ? stop : start}>
              {scanning ? <><CameraOff className="size-5" /> إيقاف الكاميرا</> : <><Camera className="size-5" /> مسح البطاقة بالكاميرا</>}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">مسح الكاميرا غير مدعوم في هذا المتصفح؛ استعمل Chrome على أندرويد، أو اكتب الاسم.</p>
          )}
          <video ref={videoRef} playsInline muted className={scanning ? "w-full rounded-md" : "hidden"} />
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); lookup(query); }}>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="الاسم أو رقم التعريف" aria-label="بحث" />
            <Button type="submit" variant="outline" aria-label="بحث"><Search className="size-4" /></Button>
          </form>
        </CardContent>
      </Card>

      {results?.map((s) => (
        <Card key={s.id}>
          <CardContent className="space-y-3 pt-6">
            <div>
              <div className="text-lg font-semibold">{s.full_name}</div>
              <div className="text-sm text-muted-foreground">{s.classes?.name ?? "—"} · <bdi>{s.national_student_id ?? ""}</bdi>
                {s.enrollment_status !== "active" && <span className="ms-2 text-destructive">({s.enrollment_status})</span>}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PhoneButtons label="الأب" phone={s.father_phone} />
              <PhoneButtons label="الأم" phone={s.mother_phone} />
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/dashboard/entry-permits"><Ticket className="size-4" /> تصريح دخول</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PhoneButtons({ label, phone }: { label: string; phone: string | null }) {
  if (!phone) return <div className="rounded-md border p-2 text-center text-xs text-muted-foreground">هاتف {label} غير مسجل</div>;
  return (
    <div className="space-y-1 rounded-md border p-2 text-center">
      <div className="text-xs text-muted-foreground">{label} · <bdi dir="ltr">{phone}</bdi></div>
      <div className="flex gap-1">
        <Button asChild size="sm" className="flex-1"><a href={`tel:${phone}`}><Phone className="size-4" /> اتصال</a></Button>
        <Button asChild size="sm" variant="outline" className="flex-1"><a href={`sms:${phone}`}><MessageSquare className="size-4" /></a></Button>
      </div>
    </div>
  );
}
