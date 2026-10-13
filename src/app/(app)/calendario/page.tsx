import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { todayInMendoza } from "@/lib/attendance";
import { requireUser } from "@/lib/auth/session";
import { EVENT_LABELS, EVENT_STYLE, monthGrid, occursOn, shiftMonth } from "@/lib/calendar";
import { loadCalendarItems } from "@/lib/calendar-server";
import { managedCourses, viewerCourses } from "@/lib/scope";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendario" };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ mes?: string; curso?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayInMendoza();
  const month = params.mes && /^\d{4}-\d{2}$/.test(params.mes) ? params.mes : today.slice(0, 7);
  const { weeks, first, last } = monthGrid(month);

  const viewer = await viewerCourses(user);
  const selected = viewer.courses.find((c) => c.id === params.curso);
  const courseIds = selected ? [selected.id] : viewer.all ? null : viewer.courses.map((c) => c.id);
  const items = await loadCalendarItems({ courseIds, from: weeks[0][0].date, to: weeks.at(-1)!.at(-1)!.date });
  const monthItems = items.filter((i) => i.start <= last && (i.end ?? i.start) >= first);
  const canCreate = (await managedCourses(user)).length > 0;
  const monthName = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  const qs = (m: string) => `?mes=${m}${selected ? `&curso=${selected.id}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Calendario"
        actions={canCreate && <LinkButton href="/calendario/nuevo">Agregar evento</LinkButton>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={qs(shiftMonth(month, -1))} className="rounded-lg p-2 hover:bg-surface-muted" aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </Link>
          <h2 className="min-w-40 text-center text-lg font-semibold first-letter:uppercase">{monthName}</h2>
          <Link href={qs(shiftMonth(month, 1))} className="rounded-lg p-2 hover:bg-surface-muted" aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </Link>
          {month !== today.slice(0, 7) && (
            <Link href={`?mes=${today.slice(0, 7)}${selected ? `&curso=${selected.id}` : ""}`} className="ml-2 text-sm text-primary hover:underline">
              Hoy
            </Link>
          )}
        </div>
        {viewer.courses.length > 1 && (
          <nav className="flex flex-wrap gap-1.5" aria-label="Filtrar por curso">
            <Link
              href={`?mes=${month}`}
              className={cn("rounded-full px-3 py-1 text-sm", !selected ? "bg-foreground text-background" : "bg-surface shadow-card hover:bg-surface-muted")}
            >
              Todos
            </Link>
            {viewer.courses.map((c) => (
              <Link
                key={c.id}
                href={`?mes=${month}&curso=${c.id}`}
                className={cn("rounded-full px-3 py-1 text-sm", selected?.id === c.id ? "bg-foreground text-background" : "bg-surface shadow-card hover:bg-surface-muted")}
              >
                {c.label}
                {c.who && <span className="opacity-75"> · {c.who}</span>}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {/* Grilla del mes (en pantallas medianas en adelante) */}
      <div className="hidden overflow-hidden rounded-2xl bg-surface shadow-card md:block">
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted text-center text-xs font-semibold text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 border-b border-border last:border-0">
            {week.map((day, i) => {
              const dayItems = items.filter((item) => occursOn(item, day.date));
              return (
                <div
                  key={day.date}
                  className={cn(
                    "min-h-28 border-r border-border p-1.5 last:border-0",
                    !day.inMonth && "bg-surface-muted/50",
                    i >= 5 && "bg-surface-muted/30",
                  )}
                >
                  <span
                    className={cn(
                      "mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs",
                      day.date === today ? "bg-primary font-semibold text-primary-foreground" : day.inMonth ? "text-foreground" : "text-muted",
                    )}
                  >
                    {Number(day.date.slice(8))}
                  </span>
                  <ul className="flex flex-col gap-0.5">
                    {dayItems.slice(0, 4).map((item) => (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          title={`${EVENT_LABELS[item.kind]} · ${item.title}${item.courses.length ? ` (${item.courses.join(", ")})` : ""}`}
                          className={cn("block truncate rounded px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80", EVENT_STYLE[item.kind])}
                        >
                          {item.time && <span className="opacity-75">{item.time} </span>}
                          {item.title}
                        </Link>
                      </li>
                    ))}
                    {dayItems.length > 4 && (
                      <li>
                        <a href={`#dia-${day.date}`} className="px-1.5 text-[11px] text-muted hover:text-primary hover:underline">
                          +{dayItems.length - 4} más
                        </a>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Agenda del mes (lista) */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold tracking-tight">Agenda del mes</h2>
        {monthItems.length === 0 ? (
          <Card className="text-sm text-muted">No hay eventos este mes.</Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {monthItems.map((item, index) => (
                <li key={item.key} id={monthItems.findIndex((i) => i.start === item.start) === index ? `dia-${item.start}` : undefined}>
                  <Link href={item.href} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-muted">
                    <span className={cn("w-12 shrink-0 rounded-lg py-1 text-center", item.start === today ? "bg-primary text-primary-foreground" : "bg-surface-muted")}>
                      <span className="block text-lg leading-tight font-semibold">{Number(item.start.slice(8))}</span>
                      <span className="block text-[11px]">
                        {new Date(`${item.start}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "short", timeZone: "UTC" })}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{item.title}</span>
                      <span className="block text-sm text-muted">
                        {EVENT_LABELS[item.kind]}
                        {item.end && ` · hasta el ${Number(item.end.slice(8))}/${Number(item.end.slice(5, 7))}`}
                        {item.time && ` · ${item.time}`}
                        {item.courses.length ? ` · ${item.courses.join(", ")}` : " · Toda la escuela"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
