import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { GraduationCap, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function DigitalBadge({
  fullName,
  className,
  cardUid,
  role = "student",
}: {
  fullName: string;
  className?: string;
  cardUid?: string;
  role?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const value = cardUid ?? `IDR:${fullName}`;

  const copyUid = async () => {
    if (!cardUid) return;
    try {
      await navigator.clipboard.writeText(cardUid);
      setCopied(true);
      toast.success("تم نسخ رقم البطاقة");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذّر النسخ");
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="h-2 bg-gradient-to-r from-primary to-accent" />
      <CardContent className="flex flex-col items-center gap-4 py-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("brand.name")}</p>
            <p className="text-lg font-bold">{fullName}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {className && <Badge variant="secondary">{className}</Badge>}
              <Badge>{t(`roles.${role}`)}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-lg bg-white p-2 shadow-sm">
            <QRCodeSVG value={value} size={120} level="M" includeMargin={false} />
          </div>
        </div>
      </CardContent>

      {cardUid && (
        <div className="border-t-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              رقم البطاقة
            </p>
            <span className="text-[10px] text-muted-foreground">
              يُعطى للحارس عند نسيان البطاقة
            </span>
          </div>
          <div className="flex items-stretch gap-2">
            <code
              className="ltr flex-1 select-all rounded-lg border-2 border-primary/40 bg-background px-4 py-3 text-center text-2xl font-black tracking-[0.25em] text-primary shadow-inner"
              dir="ltr"
            >
              {cardUid}
            </code>
            <Button
              type="button"
              size="lg"
              variant="default"
              onClick={copyUid}
              aria-label="نسخ رقم البطاقة"
              className="gap-2 px-4"
            >
              {copied ? (
                <>
                  <Check className="h-5 w-5" />
                  <span className="hidden sm:inline">نُسخ</span>
                </>
              ) : (
                <>
                  <Copy className="h-5 w-5" />
                  <span className="hidden sm:inline">نسخ</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
