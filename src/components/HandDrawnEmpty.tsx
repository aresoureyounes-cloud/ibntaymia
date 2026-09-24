import { ReactNode } from "react";
import { Sparkles } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function HandDrawnEmpty({ title, description, action }: Props) {
  return (
    <div className="glass contour flex flex-col items-center justify-center rounded-3xl px-6 py-12 text-center">
      <div className="mb-4 grid h-[72px] w-[72px] place-items-center rounded-2xl border border-accent/30 bg-primary/10 text-primary/70">
        <Sparkles className="h-8 w-8" />
      </div>
      <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
