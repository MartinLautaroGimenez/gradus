"use client";

/**
 * Planilla de notas con comportamiento de Excel:
 * - Flechas, Tab y Enter para moverse; Shift + flechas o arrastrar para seleccionar.
 * - Escribir reemplaza la celda; F2 o doble clic la edita; Esc cancela.
 * - Supr/Retroceso borra la selección.
 * - Ctrl+C / Ctrl+V copian y pegan bloques (también desde y hacia Excel).
 * - Ctrl+Z / Ctrl+Y deshacen y rehacen.
 * - Se guarda sola unos instantes después de cada cambio.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { formatGrade, gradeToText, isPassing, parseGradeInput, periodAverage, simpleAverage } from "@/lib/grades";
import { ASSESSMENT_KIND_SHORT, type AssessmentDTO, cellKey } from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { createAssessment, saveGrades } from "../actions";
import { AssessmentEditor } from "./assessment-editor";

export type SheetStudent = { enrollmentId: string; listNumber: number | null; name: string };

type Props = {
  courseSubjectId: string;
  periodId: string;
  canEdit: boolean;
  passingGrade: number;
  decimals: number;
  students: SheetStudent[];
  assessments: AssessmentDTO[];
  grades: Record<string, string>;
};

type Pos = { r: number; c: number };
type Change = { key: string; before: string; after: string };
type Editing = { r: number; c: number; text: string; /** "replace": se empezó tipeando; las flechas confirman. */ mode: "replace" | "edit" };
type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 700;

/** Normaliza lo escrito: "7.50" → "7,5", "a" → "A". Lo inválido queda como se escribió. */
function normalize(text: string) {
  const input = parseGradeInput(text);
  if (input.kind === "value") return gradeToText({ value: input.value, absent: false });
  if (input.kind === "absent") return "A";
  if (input.kind === "empty") return "";
  return text.trim();
}

export function GradeSheet(props: Props) {
  const { courseSubjectId, periodId, canEdit, passingGrade, decimals, students } = props;
  const [columns, setColumns] = useState(props.assessments);
  const [values, setValues] = useState<Record<string, string>>(props.grades);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 });
  const [focus, setFocus] = useState<Pos>({ r: 0, c: 0 });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [editorFor, setEditorFor] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef<Editing | null>(null);
  editingRef.current = editing;
  const pointerType = useRef("mouse");
  const inputRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const undoStack = useRef<Change[][]>([]);
  const redoStack = useRef<Change[][]>([]);
  const pending = useRef(new Map<string, string>());
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const rows = students.length;
  const cols = columns.length;
  const keyAt = useCallback(
    (r: number, c: number) => cellKey(columns[c].id, students[r].enrollmentId),
    [columns, students],
  );

  // ── Guardado automático ──────────────────────────────────

  const flush = useCallback(async () => {
    if (saving.current || pending.current.size === 0) return;
    saving.current = true;
    const batch = new Map(pending.current);
    pending.current.clear();
    setStatus("saving");

    const changes = [...batch].map(([key, value]) => {
      const [assessmentId, enrollmentId] = key.split("|");
      return { assessmentId, enrollmentId, value };
    });

    let ok = false;
    try {
      const result = await saveGrades(courseSubjectId, periodId, changes);
      ok = result.ok;
      if (!result.ok) {
        setStatusMessage(result.error);
        if (result.cellErrors) setCellErrors((current) => ({ ...current, ...result.cellErrors }));
      }
    } catch {
      setStatusMessage("Sin conexión con el servidor. Se reintentará al hacer el próximo cambio.");
    }
    saving.current = false;

    if (!ok) {
      // Se vuelve a encolar lo que no se pudo guardar, salvo que ya se haya cambiado de nuevo.
      for (const [key, value] of batch) if (!pending.current.has(key)) pending.current.set(key, value);
      setStatus("error");
      return;
    }
    if (pending.current.size > 0) {
      void flush();
    } else {
      setStatus("saved");
      setStatusMessage("");
    }
  }, [courseSubjectId, periodId]);

  const scheduleSave = useCallback(() => {
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [flush]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current.size > 0 || saving.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // ── Cambios de celdas ────────────────────────────────────

  const applyChanges = useCallback(
    (entries: { key: string; value: string }[], record = true) => {
      if (!canEdit) return;
      const current = valuesRef.current;
      const changes: Change[] = [];
      const nextErrors: Record<string, string | null> = {};
      for (const { key, value } of entries) {
        const after = normalize(value);
        const before = current[key] ?? "";
        if (after === before) continue;
        changes.push({ key, before, after });
        const input = parseGradeInput(after);
        if (input.kind === "invalid") {
          nextErrors[key] = input.message;
          pending.current.delete(key);
        } else {
          nextErrors[key] = null;
          pending.current.set(key, after);
        }
      }
      if (changes.length === 0) return;

      setValues((prev) => {
        const next = { ...prev };
        for (const change of changes) next[change.key] = change.after;
        return next;
      });
      setCellErrors((prev) => {
        const next = { ...prev };
        for (const [key, message] of Object.entries(nextErrors)) {
          if (message) next[key] = message;
          else delete next[key];
        }
        return next;
      });
      if (record) {
        undoStack.current.push(changes);
        redoStack.current = [];
      }
      if (pending.current.size > 0) scheduleSave();
    },
    [canEdit, scheduleSave],
  );

  function undo() {
    const changes = undoStack.current.pop();
    if (!changes) return;
    applyChanges(changes.map((c) => ({ key: c.key, value: c.before })), false);
    redoStack.current.push(changes);
  }

  function redo() {
    const changes = redoStack.current.pop();
    if (!changes) return;
    applyChanges(changes.map((c) => ({ key: c.key, value: c.after })), false);
    undoStack.current.push(changes);
  }

  // ── Selección y edición ─────────────────────────────────

  const range = useMemo(
    () => ({
      top: Math.min(anchor.r, focus.r),
      bottom: Math.max(anchor.r, focus.r),
      left: Math.min(anchor.c, focus.c),
      right: Math.max(anchor.c, focus.c),
    }),
    [anchor, focus],
  );

  function select(pos: Pos, extend = false) {
    const clamped = { r: Math.max(0, Math.min(rows - 1, pos.r)), c: Math.max(0, Math.min(cols - 1, pos.c)) };
    setFocus(clamped);
    if (!extend) setAnchor(clamped);
    requestAnimationFrame(() =>
      gridRef.current
        ?.querySelector(`[data-cell="${clamped.r}-${clamped.c}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    );
  }

  function startEditing(pos: Pos, text: string, mode: Editing["mode"]) {
    if (!canEdit || cols === 0) return;
    setEditing({ ...pos, text, mode });
  }

  function commitEditing(move?: Pos) {
    // Puede llamarse dos veces seguidas (clic en otra celda + blur): sólo cuenta la primera.
    const current = editingRef.current;
    if (!current) return;
    editingRef.current = null;
    applyChanges([{ key: keyAt(current.r, current.c), value: current.text }]);
    setEditing(null);
    if (move) select(move);
    gridRef.current?.focus();
  }

  function cancelEditing() {
    editingRef.current = null;
    setEditing(null);
    gridRef.current?.focus();
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      if (editing.mode === "edit") inputRef.current?.select();
    }
    // Sólo al empezar a editar una celda nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.r, editing?.c]);

  function selectedKeys() {
    const keys: string[] = [];
    for (let r = range.top; r <= range.bottom; r++) for (let c = range.left; c <= range.right; c++) keys.push(keyAt(r, c));
    return keys;
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (editing || cols === 0 || rows === 0 || event.target !== gridRef.current) return;
    const mod = event.ctrlKey || event.metaKey;
    const { key, shiftKey } = event;

    const moves: Record<string, Pos> = {
      ArrowUp: { r: focus.r - 1, c: focus.c },
      ArrowDown: { r: focus.r + 1, c: focus.c },
      ArrowLeft: { r: focus.r, c: focus.c - 1 },
      ArrowRight: { r: focus.r, c: focus.c + 1 },
    };
    if (moves[key]) {
      event.preventDefault();
      const target = mod
        ? { ArrowUp: { r: 0, c: focus.c }, ArrowDown: { r: rows - 1, c: focus.c }, ArrowLeft: { r: focus.r, c: 0 }, ArrowRight: { r: focus.r, c: cols - 1 } }[key]!
        : moves[key];
      select(target, shiftKey);
      return;
    }
    if (key === "Tab") {
      event.preventDefault();
      select({ r: focus.r, c: focus.c + (shiftKey ? -1 : 1) });
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      select({ r: focus.r + (shiftKey ? -1 : 1), c: focus.c });
      return;
    }
    if (key === "F2") {
      event.preventDefault();
      startEditing(focus, values[keyAt(focus.r, focus.c)] ?? "", "edit");
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      applyChanges(selectedKeys().map((k) => ({ key: k, value: "" })));
      return;
    }
    if (mod && key.toLowerCase() === "z") {
      event.preventDefault();
      if (shiftKey) redo();
      else undo();
      return;
    }
    if (mod && key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (mod && key.toLowerCase() === "a") {
      event.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setFocus({ r: rows - 1, c: cols - 1 });
      return;
    }
    // Cualquier carácter imprimible empieza a editar reemplazando el contenido.
    if (key.length === 1 && !mod && !event.altKey) {
      event.preventDefault();
      startEditing(focus, key, "replace");
    }
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!editing) return;
    const { key, shiftKey } = event;
    const here = { r: editing.r, c: editing.c };
    if (key === "Enter") {
      event.preventDefault();
      commitEditing({ r: here.r + (shiftKey ? -1 : 1), c: here.c });
    } else if (key === "Tab") {
      event.preventDefault();
      commitEditing({ r: here.r, c: here.c + (shiftKey ? -1 : 1) });
    } else if (key === "Escape") {
      event.preventDefault();
      cancelEditing();
    } else if (editing.mode === "replace" && key.startsWith("Arrow")) {
      event.preventDefault();
      const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[key]!;
      commitEditing({ r: here.r + delta[0], c: here.c + delta[1] });
    }
  }

  // ── Copiar y pegar (formato de Excel: tabulaciones y saltos de línea) ──

  useEffect(() => {
    function active() {
      return !editing && !editorFor && gridRef.current && document.activeElement === gridRef.current;
    }
    function onCopy(event: ClipboardEvent) {
      if (!active() || cols === 0) return;
      const lines: string[] = [];
      for (let r = range.top; r <= range.bottom; r++) {
        const cells: string[] = [];
        for (let c = range.left; c <= range.right; c++) cells.push(values[keyAt(r, c)] ?? "");
        lines.push(cells.join("\t"));
      }
      event.clipboardData?.setData("text/plain", lines.join("\n"));
      event.preventDefault();
    }
    function onPaste(event: ClipboardEvent) {
      if (!active() || !canEdit || cols === 0) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      event.preventDefault();
      const matrix = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
      const entries: { key: string; value: string }[] = [];

      if (matrix.length === 1 && matrix[0].length === 1) {
        // Un solo valor: se copia en toda la selección, como en Excel.
        for (const key of selectedKeys()) entries.push({ key, value: matrix[0][0] });
      } else {
        matrix.forEach((line, i) =>
          line.forEach((value, j) => {
            const r = range.top + i;
            const c = range.left + j;
            if (r < rows && c < cols) entries.push({ key: keyAt(r, c), value });
          }),
        );
        setFocus({
          r: Math.min(rows - 1, range.top + matrix.length - 1),
          c: Math.min(cols - 1, range.left + Math.max(...matrix.map((l) => l.length)) - 1),
        });
      }
      applyChanges(entries);
    }
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  });

  useEffect(() => {
    const stop = () => (dragging.current = false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  // ── Columnas ────────────────────────────────────────────

  async function addColumn() {
    setAddingColumn(true);
    const result = await createAssessment(courseSubjectId, periodId);
    setAddingColumn(false);
    if (!result.ok) {
      setStatus("error");
      setStatusMessage(result.error);
      return;
    }
    setColumns((current) => [...current, result.assessment]);
    setEditorFor(result.assessment.id);
  }

  // ── Cálculos ────────────────────────────────────────────

  const gradeFor = (enrollmentId: string) => (assessmentId: string) =>
    parseGradeInput(values[cellKey(assessmentId, enrollmentId)] ?? "");

  const studentAverages = students.map((s) => periodAverage(columns, gradeFor(s.enrollmentId), decimals));
  const columnAverages = columns.map((column) =>
    simpleAverage(
      students
        .map((s) => parseGradeInput(values[cellKey(column.id, s.enrollmentId)] ?? ""))
        .flatMap((g) => (g.kind === "value" ? [g.value] : [])),
      decimals,
    ),
  );
  const loaded = columns.map(
    (column) => students.filter((s) => parseGradeInput(values[cellKey(column.id, s.enrollmentId)] ?? "").kind !== "empty").length,
  );
  const errorCount = Object.keys(cellErrors).length;

  const statusText: Record<SaveStatus, string> = {
    idle: "",
    pending: "Cambios sin guardar…",
    saving: "Guardando…",
    saved: "Todo guardado",
    error: statusMessage || "No se pudo guardar",
  };

  // ── Render ──────────────────────────────────────────────

  if (rows === 0) {
    return (
      <div className="rounded-2xl bg-surface shadow-card p-5 text-sm text-muted">
        No hay alumnos para esta planilla.
      </div>
    );
  }

  const activeError = cols > 0 ? cellErrors[keyAt(focus.r, focus.c)] : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 text-xs">
        <span
          role="status"
          className={cn(
            "font-medium",
            status === "error" ? "text-danger" : status === "saved" ? "text-success" : "text-muted",
          )}
        >
          {statusText[status]}
          {status === "error" && pending.current.size > 0 && (
            <button type="button" onClick={() => void flush()} className="ml-2 underline">
              Reintentar
            </button>
          )}
        </span>
        {errorCount > 0 && (
          <span className="text-danger">
            {errorCount} {errorCount === 1 ? "celda con error" : "celdas con error"} (no se guardan hasta corregirlas)
          </span>
        )}
      </div>

      <div
        ref={gridRef}
        tabIndex={0}
        role="grid"
        aria-label="Planilla de notas"
        aria-rowcount={rows + 1}
        onKeyDown={onGridKeyDown}
        className="relative max-h-[70vh] w-fit max-w-full overflow-auto rounded-2xl bg-surface shadow-card outline-none focus-visible:ring-2 focus-visible:ring-primary-soft"
      >
        <table className="border-separate border-spacing-0 text-sm select-none">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 w-10 border-r border-b border-border bg-surface-muted px-2 py-2 text-xs font-semibold text-muted">
                N°
              </th>
              <th className="sticky top-0 left-10 z-30 min-w-44 border-r border-b border-border bg-surface-muted px-3 py-2 text-left text-xs font-semibold text-muted sm:min-w-56">
                Alumno
              </th>
              {columns.map((column, c) => (
                <th
                  key={column.id}
                  className={cn(
                    "sticky top-0 z-20 min-w-20 border-r border-b border-border bg-surface-muted p-0 align-bottom",
                    c >= range.left && c <= range.right && "bg-primary-soft",
                  )}
                >
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setEditorFor(column.id)}
                    title={canEdit ? "Editar evaluación" : column.title}
                    className="flex w-full flex-col items-center px-2 py-1.5 text-center enabled:hover:bg-primary-soft"
                  >
                    <span className="max-w-28 truncate text-xs font-semibold text-foreground">{column.title}</span>
                    <span className="text-[10px] font-normal text-muted">
                      {ASSESSMENT_KIND_SHORT[column.kind]}
                      {column.date && ` · ${column.date.slice(8, 10)}/${column.date.slice(5, 7)}`}
                      {column.weight !== 1 && ` · ×${column.weight.toLocaleString("es-AR")}`}
                    </span>
                  </button>
                  {editorFor === column.id && (
                    <AssessmentEditor
                      assessment={column}
                      gradeCount={loaded[c]}
                      canMoveLeft={c > 0}
                      canMoveRight={c < cols - 1}
                      onClose={() => {
                        setEditorFor(null);
                        gridRef.current?.focus();
                      }}
                      onSaved={(updated) => setColumns((all) => all.map((a) => (a.id === updated.id ? updated : a)))}
                      onDeleted={() => {
                        setColumns((all) => all.filter((a) => a.id !== column.id));
                        select({ r: focus.r, c: Math.max(0, Math.min(focus.c, cols - 2)) });
                      }}
                      onMoved={(direction) =>
                        setColumns((all) => {
                          const next = [...all];
                          const i = next.findIndex((a) => a.id === column.id);
                          [next[i], next[i + direction]] = [next[i + direction], next[i]];
                          return next;
                        })
                      }
                    />
                  )}
                </th>
              ))}
              {canEdit && (
                <th className="sticky top-0 z-20 border-r border-b border-border bg-surface-muted p-0">
                  <button
                    type="button"
                    onClick={addColumn}
                    disabled={addingColumn}
                    className="flex h-full w-full items-center justify-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap text-primary hover:bg-primary-soft disabled:opacity-60"
                  >
                    <Plus className="size-3.5" aria-hidden /> Evaluación
                  </button>
                </th>
              )}
              <th className="sticky top-0 right-0 z-20 min-w-20 border-b border-l border-border bg-surface-muted px-2 py-2 text-xs font-semibold text-foreground">
                Promedio
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, r) => {
              const average = studentAverages[r];
              const rowSelected = r >= range.top && r <= range.bottom;
              return (
                <tr key={student.enrollmentId}>
                  <td
                    className={cn(
                      "sticky left-0 z-10 border-r border-b border-border bg-surface px-2 py-1.5 text-center text-xs tabular-nums text-muted",
                      rowSelected && "bg-primary-soft",
                    )}
                  >
                    {student.listNumber ?? r + 1}
                  </td>
                  <td
                    className={cn(
                      "sticky left-10 z-10 max-w-56 truncate border-r border-b border-border bg-surface px-3 py-1.5 font-medium whitespace-nowrap",
                      rowSelected && "bg-primary-soft",
                    )}
                  >
                    {student.name}
                  </td>
                  {columns.map((column, c) => {
                    const key = cellKey(column.id, student.enrollmentId);
                    const value = values[key] ?? "";
                    const input = parseGradeInput(value);
                    const isFocus = focus.r === r && focus.c === c;
                    const inRange = rowSelected && c >= range.left && c <= range.right;
                    const isEditing = editing?.r === r && editing?.c === c;
                    const error = cellErrors[key];
                    return (
                      <td
                        key={column.id}
                        data-cell={`${r}-${c}`}
                        role="gridcell"
                        aria-selected={inRange}
                        title={error}
                        onPointerDown={(event) => {
                          pointerType.current = event.pointerType;
                          // En pantallas táctiles se edita con un toque (onClick) para no
                          // abrir el teclado cuando la persona sólo quiere desplazarse.
                          if (isEditing || event.pointerType === "touch") return;
                          commitEditing();
                          event.preventDefault();
                          gridRef.current?.focus();
                          dragging.current = true;
                          select({ r, c }, event.shiftKey);
                        }}
                        onClick={() => {
                          if (pointerType.current !== "touch" || isEditing) return;
                          commitEditing();
                          select({ r, c });
                          startEditing({ r, c }, value, "edit");
                        }}
                        onPointerEnter={() => {
                          if (dragging.current) setFocus({ r, c });
                        }}
                        onDoubleClick={() => startEditing({ r, c }, value, "edit")}
                        className={cn(
                          "relative h-9 border-r border-b border-border p-0 text-center tabular-nums",
                          inRange && "bg-primary-soft/60",
                          error && "bg-danger-soft",
                          input.kind === "value" && !isPassing(input.value, passingGrade) && "text-danger",
                          input.kind === "absent" && "text-muted",
                          canEdit ? "cursor-cell" : "cursor-default",
                        )}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            value={editing.text}
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={`Nota de ${student.name} en ${column.title}`}
                            onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                            onKeyDown={onInputKeyDown}
                            onBlur={() => commitEditing()}
                            className="absolute inset-0 h-full w-full bg-surface text-center text-foreground outline-2 -outline-offset-2 outline-primary"
                          />
                        ) : (
                          <span className="block px-2">{value}</span>
                        )}
                        {isFocus && !isEditing && (
                          <span aria-hidden className="pointer-events-none absolute -inset-px border-2 border-primary" />
                        )}
                      </td>
                    );
                  })}
                  {canEdit && <td className="border-r border-b border-border bg-surface-muted/50" />}
                  <td
                    className={cn(
                      "sticky right-0 z-10 border-b border-l border-border bg-surface-muted px-2 text-center font-semibold tabular-nums",
                      average !== null && !isPassing(average, passingGrade) && "text-danger",
                    )}
                  >
                    {average === null ? "—" : formatGrade(average, decimals)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky bottom-0 left-0 z-20 border-t border-r border-border bg-surface-muted" />
              <td className="sticky bottom-0 left-10 z-20 border-t border-r border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-muted">
                Promedio del curso
              </td>
              {columns.map((column, c) => (
                <td
                  key={column.id}
                  className="sticky bottom-0 z-10 border-t border-r border-border bg-surface-muted px-2 py-1.5 text-center text-xs tabular-nums text-muted"
                  title={`${loaded[c]} de ${rows} notas cargadas`}
                >
                  {columnAverages[c] === null ? "—" : formatGrade(columnAverages[c], decimals)}
                  <span className="block text-[10px]">
                    {loaded[c]}/{rows}
                  </span>
                </td>
              ))}
              {canEdit && <td className="sticky bottom-0 border-t border-r border-border bg-surface-muted" />}
              <td className="sticky right-0 bottom-0 z-20 border-t border-l border-border bg-surface-muted px-2 text-center text-xs font-semibold tabular-nums">
                {(() => {
                  const avg = simpleAverage(studentAverages.filter((a): a is number => a !== null), decimals);
                  return avg === null ? "—" : formatGrade(avg, decimals);
                })()}
              </td>
            </tr>
          </tfoot>
        </table>
        {cols === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted">
            {canEdit ? "Agregá la primera evaluación con el botón “+ Evaluación”." : "Todavía no hay evaluaciones en este período."}
          </p>
        )}
      </div>

      {activeError && <p className="text-xs text-danger">{activeError}</p>}
    </div>
  );
}
