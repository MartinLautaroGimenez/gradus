import { cn } from "@/lib/utils";

/** Columnas de una sola serie (por ejemplo, la distribución de promedios). */
export function ColumnChart({
  items,
  unit,
  highlightFrom,
  caption,
}: {
  items: { label: string; count: number; from: number }[];
  unit: [string, string];
  /** Las franjas desde este valor se marcan como "aprobadas" en la etiqueta. */
  highlightFrom?: number;
  caption: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((sum, i) => sum + i.count, 0);
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex h-48 items-end gap-2 border-b border-border px-1 sm:gap-4">
        {items.map((item) => (
          <div
            key={item.label}
            tabIndex={0}
            className="group relative flex h-full flex-1 flex-col items-center justify-end outline-none focus-visible:ring-2 focus-visible:ring-primary-soft"
          >
            <span className="mb-1 text-xs font-semibold tabular-nums">{item.count || ""}</span>
            <span
              className="w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
              style={{ height: `${(item.count / max) * 85}%`, minHeight: item.count ? 2 : 0 }}
            />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full z-20 mb-1 hidden rounded-lg border border-border bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-lg group-hover:block group-focus-visible:block"
            >
              <span className="block font-semibold">Promedio {item.label.toLowerCase()}</span>
              <span className="block text-muted">
                {item.count} {item.count === 1 ? unit[0] : unit[1]}
                {total ? ` (${Math.round((item.count / total) * 100)} %)` : ""}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 px-1 sm:gap-4">
        {items.map((item) => (
          <span
            key={item.label}
            className={cn("flex-1 text-center text-[11px] leading-tight text-muted", highlightFrom !== undefined && item.from >= highlightFrom && "font-medium text-foreground")}
          >
            {item.label}
          </span>
        ))}
      </div>
      <figcaption className="text-xs text-muted">{caption}</figcaption>
    </figure>
  );
}
