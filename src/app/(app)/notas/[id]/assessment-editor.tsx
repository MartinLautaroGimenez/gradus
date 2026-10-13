"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ASSESSMENT_KIND_LABELS, type AssessmentDTO } from "@/lib/grading/types";
import { deleteAssessment, moveAssessment, updateAssessment } from "../actions";

export function AssessmentEditor({
  assessment,
  gradeCount,
  canMoveLeft,
  canMoveRight,
  onClose,
  onSaved,
  onDeleted,
  onMoved,
}: {
  assessment: AssessmentDTO;
  gradeCount: number;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onClose: () => void;
  onSaved: (assessment: AssessmentDTO) => void;
  onDeleted: () => void;
  onMoved: (direction: -1 | 1) => void;
}) {
  const [title, setTitle] = useState(assessment.title);
  const [kind, setKind] = useState(assessment.kind);
  const [date, setDate] = useState(assessment.date ?? "");
  const [weight, setWeight] = useState(String(assessment.weight).replace(".", ","));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function run<T extends { ok: boolean; error?: string }>(action: () => Promise<T>) {
    setBusy(true);
    setError("");
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(result.error ?? "No se pudo guardar");
    return result;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const numericWeight = Number(weight.replace(",", "."));
    if (!Number.isFinite(numericWeight)) {
      setError("El peso tiene que ser un número");
      return;
    }
    const result = await run(() =>
      updateAssessment(assessment.id, { title, kind, date: date || null, weight: numericWeight }),
    );
    if (result.ok && "assessment" in result) {
      onSaved(result.assessment);
      onClose();
    }
  }

  async function remove() {
    const message =
      gradeCount > 0
        ? `¿Eliminar "${assessment.title}"? Se borran también sus ${gradeCount} notas cargadas.`
        : `¿Eliminar "${assessment.title}"?`;
    if (!window.confirm(message)) return;
    const result = await run(() => deleteAssessment(assessment.id));
    if (result.ok) {
      onDeleted();
      onClose();
    }
  }

  async function move(direction: -1 | 1) {
    const result = await run(() => moveAssessment(assessment.id, direction));
    if (result.ok) onMoved(direction);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && onClose()}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-3xl bg-surface p-0 text-left font-normal text-foreground shadow-float backdrop:bg-black/40"
    >
      <form onSubmit={save} className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Evaluación</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-muted" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <Field label="Nombre" htmlFor="a-title">
          <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" htmlFor="a-kind">
            <Select id="a-kind" value={kind} onChange={(e) => setKind(e.target.value as AssessmentDTO["kind"])}>
              {Object.entries(ASSESSMENT_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha" htmlFor="a-date">
            <Input id="a-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Peso en el promedio" htmlFor="a-weight" hint="1 = normal. Un examen con peso 2 vale el doble que un trabajo con peso 1.">
          <Input id="a-weight" value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" className="w-24" />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div className="flex gap-1">
            <Button type="button" variant="ghost" className="px-2" disabled={busy || !canMoveLeft} onClick={() => move(-1)} title="Mover a la izquierda">
              <ChevronLeft className="size-4" aria-hidden />
              <span className="sr-only">Mover a la izquierda</span>
            </Button>
            <Button type="button" variant="ghost" className="px-2" disabled={busy || !canMoveRight} onClick={() => move(1)} title="Mover a la derecha">
              <ChevronRight className="size-4" aria-hidden />
              <span className="sr-only">Mover a la derecha</span>
            </Button>
            <Button type="button" variant="ghost" className="text-danger" disabled={busy} onClick={remove}>
              Eliminar
            </Button>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
