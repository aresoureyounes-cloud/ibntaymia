import { Download, HardDrive, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { UpdateProgress, RemoteVersion } from "@/lib/use-app-update";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  progress: UpdateProgress;
  remote?: RemoteVersion | null;
};

const STEPS = [
  { key: "downloading", label: "تنزيل", icon: Download },
  { key: "caching", label: "تحديث الذاكرة", icon: HardDrive },
  { key: "applying", label: "تطبيق", icon: RefreshCw },
] as const;

function stageIndex(stage: UpdateProgress["stage"]) {
  switch (stage) {
    case "downloading": return 0;
    case "caching": return 1;
    case "applying": return 2;
    case "done": return 3;
    default: return -1;
  }
}

export function UpdateProgressDialog({ open, progress, remote }: Props) {
  const idx = stageIndex(progress.stage);
  const isError = progress.stage === "error";
  const isDone = progress.stage === "done";

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md [&>button.absolute]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isError ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
            ) : isDone ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {isError
              ? "فشل التحديث"
              : isDone
              ? "اكتمل التحديث"
              : `جارٍ تحديث إداروم${remote ? ` إلى v${remote.version}` : ""}`}
          </DialogTitle>
          <DialogDescription>
            {isError
              ? "حدث خطأ أثناء تطبيق التحديث. أعد المحاولة."
              : "يرجى عدم إغلاق التطبيق حتى اكتمال العملية."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Progress value={progress.percent} className={cn(isError && "opacity-50")} />
          <div className="text-center text-sm text-muted-foreground">
            {progress.message} {!isError && !isDone && `— ${progress.percent}%`}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const active = i === idx && !isError;
              const done = i < idx || isDone;
              return (
                <div key={step.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors",
                      done && "border-emerald-500 bg-emerald-500/10 text-emerald-600",
                      active && "border-primary bg-primary/10 text-primary",
                      !done && !active && "border-border text-muted-foreground",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Icon className={cn("h-4 w-4", active && "animate-pulse")} />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      (active || done) ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
