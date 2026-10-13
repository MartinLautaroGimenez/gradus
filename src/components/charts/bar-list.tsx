import Link from "next/link";

export type BarItem = {
  key: string;
  label: string;
  value: number | null;
  /** Texto del valor al final de la barra. */
  display: string;
  /** Líneas del tooltip. */
  details?: string[];
  href?: string;
};

/**
 * Barras horizontales de una sola serie (sin leyenda: el título dice qué se
 * mide). Valor en la punta, línea de referencia opcional, tooltip al pasar el
 * mouse o enfocar con teclado, y la misma información como tabla.
 */
export function BarList({
  items,
  max,
  reference,
  valueHeader,
  emptyText = "Sin datos todavía.",
}: {
  items: BarItem[];
  max: number;
  reference?: { value: number; label: string };
  valueHeader: string;
  emptyText?: string;
}) {
  const shown = items.filter((i) => i.value !== null);
  if (shown.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex flex-col gap-1.5">
        {reference && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-0 hidden sm:block"
            style={{ left: `calc(10rem + 0.75rem + (100% - 10rem - 0.75rem - 4rem - 0.75rem) * ${reference.value / max})` }}
          >
            <div className="h-full border-l border-border" />
            <span className="absolute -top-5 -translate-x-1/2 text-[10px] whitespace-nowrap text-muted">{reference.label}</span>
          </div>
        )}
        {shown.map((item) => {
          const Row = item.href ? Link : "div";
          return (
            <Row
              key={item.key}
              href={item.href as string}
              tabIndex={item.href ? undefined : 0}
              className="group relative z-10 grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-3 rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-primary-soft sm:grid-cols-[10rem_minmax(0,1fr)_4rem]"
            >
              <span className="col-span-2 truncate text-sm sm:col-span-1" title={item.label}>
                {item.label}
              </span>
              <span className="relative h-4">
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px] bg-primary transition-opacity group-hover:opacity-80"
                  style={{ width: pct(item.value!) }}
                />
              </span>
              <span className="text-right text-sm font-semibold tabular-nums">{item.display}</span>
              {item.details && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-full left-0 z-20 mt-1 hidden min-w-48 rounded-xl bg-surface px-3 py-2 text-xs shadow-float shadow-lg group-hover:block group-focus-visible:block sm:left-[10.75rem]"
                >
                  <span className="mb-0.5 block font-semibold">{item.label}</span>
                  {item.details.map((d) => (
                    <span key={d} className="block text-muted">
                      {d}
                    </span>
                  ))}
                </span>
              )}
            </Row>
          );
        })}
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Ver como tabla</summary>
        <table className="mt-2 w-full text-sm text-foreground">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="py-1 font-medium">Nombre</th>
              <th className="py-1 text-right font-medium">{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key} className="border-b border-border last:border-0">
                <td className="py-1">{item.label}</td>
                <td className="py-1 text-right tabular-nums">{item.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
