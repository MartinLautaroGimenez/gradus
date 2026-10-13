"use client";

/**
 * Toma de lista del día. Arranca con todos presentes: sólo se marcan las
 * excepciones. Con el teclado: flechas para moverse, P / A / T / R para
 * marcar (y baja a la fila siguiente), J para justificar.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttendanceStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ALERT_LABELS,
  ATTENDANCE_LABELS,
  ATTENDANCE_SHORT,
  type AttendanceSettings,
  absenceValue,
  attendanceAlert,
  formatAbsences,
} from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { deleteAttendanceDay, saveAttendance } from "../actions";

export type AttendanceRow = {
  enrollmentId: string;
  listNumber: number | null;
  name: string;
  status: AttendanceStatus;
  justified: boolean;
  note: string | null;
  /** Inasistencias del ciclo sin contar este día. */
  otherDaysTotal: number;
};

const STATUSES: AttendanceStatus[] = ["PRESENTE", "AUSENTE", "TARDE", "RETIRO"];

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENTE: "bg-success-soft text-success border-success/40",
  AUSENTE: "bg-danger-soft text-danger border-danger/40",
  TARDE: "bg-warning-soft text-warning border-warning/40",
  RETIRO: "bg-warning-soft text-warning border-warning/40",
};

const ALERT_TONE = { OK: "neutral", ATENCION: "warning", CRITICO: "danger", LIBRE: "danger" } as const;

export function AttendanceSheet({
  courseId,
  date,
  taken,
  canEdit,
  settings,
  initialRows,
}: {
  courseId: string;
  date: string;
  taken: boolean;
  canEdit: boolean;
  settings: AttendanceSettings;
  initialRows: AttendanceRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [active, setActive] = useState(0);
  const [dirty, setDirty] = useState(!taken);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty && canEdit && taken) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, canEdit, taken]);

  function update(index: number, patch: Partial<AttendanceRow>) {
    if (!canEdit) return;
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setDirty(true);
    setMessage(null);
  }

  function focusRow(index: number) {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    setActive(next);
    tableRef.current?.querySelector<HTMLElement>(`[data-row="${next}"]`)?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if ((event.target as HTMLElement).tagName === "INPUT") return;
    const key = event.key.toLowerCase();
    const byKey: Record<string, AttendanceStatus> = { p: "PRESENTE", a: "AUSENTE", t: "TARDE", r: "RETIRO" };
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(index - 1);
    } else if (byKey[key] && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      update(index, { status: byKey[key] });
      focusRow(index + 1);
    } else if (key === "j" && rows[index].status !== "PRESENTE") {
      event.preventDefault();
      update(index, { justified: !rows[index].justified });
    }
  }

  async function save() {
    setSaving(true);
    const result = await saveAttendance(
      courseId,
      date,
      rows.map(({ enrollmentId, status, justified, note }) => ({ enrollmentId, status, justified, note })),
    );
    setSaving(false);
    if (result.ok) {
      setDirty(false);
      setMessage({ ok: true, text: "Asistencia guardada" });
      router.refresh();
    } else {
      setMessage({ ok: false, text: result.error });
    }
  }

  async function removeDay() {
    if (!window.confirm("¿Borrar la lista de este día? Se pierden las marcas de todos los alumnos.")) return;
    const result = await deleteAttendanceDay(courseId, date);
    if (result.ok) router.refresh();
    else setMessage({ ok: false, text: result.error });
  }

  const counts = STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length] as const);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {counts.map(([status, count]) => (
          <span key={status} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>
            {ATTENDANCE_LABELS[status]}: {count}
          </span>
        ))}
        {!taken && <Badge tone="warning">Todavía no se tomó lista este día</Badge>}
      </div>

      <div ref={tableRef} className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="w-10 px-3 py-2">N°</th>
              <th className="px-3 py-2">Alumno</th>
              <th className="px-3 py-2">Asistencia</th>
              <th className="hidden px-3 py-2 md:table-cell">Justificación</th>
              <th className="px-3 py-2 text-right">Faltas del ciclo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const total = row.otherDaysTotal + absenceValue(row, settings);
              const alert = attendanceAlert(total, settings.maxAbsences);
              return (
                <tr
                  key={row.enrollmentId}
                  data-row={index}
                  tabIndex={0}
                  onFocus={() => setActive(index)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  className={cn(
                    "border-t border-border outline-none",
                    active === index && "bg-primary-soft/50",
                  )}
                >
                  <td className="px-3 py-2 text-xs tabular-nums text-muted">{row.listNumber ?? index + 1}</td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {row.name}
                    {row.status !== "PRESENTE" && (
                      <label className="mt-1 flex items-center gap-1.5 text-xs font-normal md:hidden">
                        <input
                          type="checkbox"
                          checked={row.justified}
                          disabled={!canEdit}
                          onChange={(e) => update(index, { justified: e.target.checked })}
                          className="size-4"
                        />
                        Justificada
                      </label>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1" role="radiogroup" aria-label={`Asistencia de ${row.name}`}>
                      {STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          role="radio"
                          aria-checked={row.status === status}
                          title={ATTENDANCE_LABELS[status]}
                          disabled={!canEdit}
                          tabIndex={-1}
                          onClick={() => update(index, { status })}
                          className={cn(
                            "size-9 rounded-lg border text-sm font-semibold transition-colors",
                            row.status === status
                              ? STATUS_STYLE[status]
                              : "border-border text-muted enabled:hover:bg-surface-muted",
                          )}
                        >
                          {ATTENDANCE_SHORT[status]}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="hidden px-3 py-1.5 md:table-cell">
                    {row.status !== "PRESENTE" && (
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={row.justified}
                            disabled={!canEdit}
                            onChange={(e) => update(index, { justified: e.target.checked })}
                            className="size-4"
                          />
                          Justificada
                        </label>
                        <input
                          value={row.note ?? ""}
                          disabled={!canEdit}
                          onChange={(e) => update(index, { note: e.target.value })}
                          placeholder="Motivo (opcional)"
                          maxLength={200}
                          className="h-8 w-full min-w-32 rounded-md border border-border bg-surface px-2 text-xs"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span className="font-semibold tabular-nums">{formatAbsences(total)}</span>
                    <span className="text-xs text-muted"> / {settings.maxAbsences}</span>
                    {alert !== "OK" && (
                      <Badge tone={ALERT_TONE[alert]} className="ml-2">
                        {ALERT_LABELS[alert]}
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 bg-background/90 px-1 py-3 backdrop-blur">
          <Button onClick={save} disabled={saving || (!dirty && taken)}>
            {saving ? "Guardando…" : taken ? "Guardar cambios" : "Guardar asistencia"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setRows((current) => current.map((r) => ({ ...r, status: "PRESENTE", justified: false, note: null })));
              setDirty(true);
            }}
          >
            Todos presentes
          </Button>
          {taken && (
            <Button variant="ghost" className="text-danger" onClick={removeDay}>
              Borrar lista del día
            </Button>
          )}
          {message && (
            <span role="status" className={cn("text-sm", message.ok ? "text-success" : "text-danger")}>
              {message.text}
            </span>
          )}
          {dirty && taken && !message && <span className="text-sm text-warning">Hay cambios sin guardar</span>}
          <span className="hidden text-xs text-muted lg:inline">
            Teclado: ↑ ↓ para moverse · P A T R para marcar · J justifica
          </span>
        </div>
      )}
    </div>
  );
}
