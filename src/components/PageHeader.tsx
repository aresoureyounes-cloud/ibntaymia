import { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, description, icon, actions }: Props) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        {icon ? (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-primary/10 text-primary">
            {icon}
          </span>
        ) : null}
        <div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
