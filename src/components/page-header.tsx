import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Título grande (como en iOS) con volver opcional y acciones a la derecha. */
export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-2">
      {back && (
        <Link href={back.href} className="-ml-1.5 inline-flex w-fit items-center text-[15px] text-primary hover:opacity-80">
          <ChevronLeft className="size-5" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[34px]">{title}</h1>
          {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
