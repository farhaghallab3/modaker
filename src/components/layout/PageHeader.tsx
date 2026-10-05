import type { ReactNode } from "react";

/** Consistent page heading: optional eyebrow, Amiri title, supporting line, actions. */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div className="min-w-0">
        {eyebrow ? <p className="text-sm text-olive font-medium mb-1.5">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl sm:text-4xl text-forest leading-tight">{title}</h1>
        {description ? <p className="mt-2 text-muted leading-7 max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** Page width container used by every in-app screen. */
export function Page({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <div className={`mx-auto w-full px-4 sm:px-6 lg:px-10 pt-6 lg:pt-10 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}>{children}</div>;
}
