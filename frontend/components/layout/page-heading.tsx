import { cn } from "@/lib/utils";

export function PageHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow ? <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p> : null}
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {description ? <p className="mt-4 text-lg leading-8 text-muted-foreground">{description}</p> : null}
    </div>
  );
}
