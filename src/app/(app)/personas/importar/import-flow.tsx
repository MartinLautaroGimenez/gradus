"use client";

import { useRef } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { useFormAction } from "@/lib/use-form-action";
import { type ImportState, importPeople } from "./actions";

const STATUS_BADGE = {
  nuevo: { tone: "success", label: "Nuevo" },
  actualizar: { tone: "primary", label: "Se actualiza" },
  existente: { tone: "neutral", label: "Se omite" },
  error: { tone: "danger", label: "Error" },
} as const;

/** Evita que Excel interprete un texto como fórmula (=, +, -, @). */
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadCredentials(rows: { name: string; dni: string; role: string; password: string }[]) {
  const lines = [["Nombre", "Rol", "Usuario (DNI)", "Contraseña inicial"], ...rows.map((r) => [r.name, r.role, r.dni, r.password])];
  const csv = "\uFEFF" + lines.map((line) => line.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: "gradus-contrasenas-iniciales.csv" });
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportFlow({ kind }: { kind: "alumnos" | "personal" }) {
  const [state, onSubmit, pending] = useFormAction<ImportState>(importPeople, {});
  const formRef = useRef<HTMLFormElement>(null);
  const preview = state.preview;
  const columns =
    kind === "alumnos"
      ? { detail: "Curso", extra: "Familia", noun: "alumnos" }
      : { detail: "Rol", extra: "Cursos a cargo", noun: "personas" };

  if (state.done) {
    return (
      <Card className="flex flex-col gap-3">
        <CardTitle>Importación terminada</CardTitle>
        <ul className="text-sm">
          {state.done.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {state.done.credentials.length > 0 && (
          <div className="flex flex-col items-start gap-2 rounded-2xl bg-warning-soft p-4">
            <p className="text-[15px] font-semibold">Descargá las contraseñas iniciales ahora</p>
            <p className="text-sm text-muted">
              Cada cuenta nueva tiene una contraseña al azar que se muestra sólo esta vez. Entregala a cada persona y
              después borrá el archivo; al ingresar se le pide cambiarla.
            </p>
            <Button type="button" onClick={() => downloadCredentials(state.done!.credentials)}>
              Descargar contraseñas ({state.done.credentials.length})
            </Button>
          </div>
        )}
        <Link href="/personas" className="text-sm font-medium text-primary hover:underline">
          Ver personas
        </Link>
      </Card>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="kind" value={kind} />
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            accept=".xlsx,.csv"
            required
            aria-label="Archivo"
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
            // Al cambiar de archivo se vuelve a la vista previa.
            onChange={() => formRef.current?.requestSubmit(formRef.current.querySelector<HTMLButtonElement>("[value=preview]"))}
          />
          <Button type="submit" name="mode" value="preview" variant="secondary" disabled={pending}>
            {pending ? "Leyendo…" : "Revisar archivo"}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="createCourses"
            className="size-4"
            onChange={() => preview && formRef.current?.requestSubmit(formRef.current.querySelector<HTMLButtonElement>("[value=preview]"))}
          />
          Crear los cursos que falten en el ciclo activo
        </label>
      </Card>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      {preview && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 text-sm">
            {preview.summary.map((item) => (
              <Badge key={item.label} tone={item.tone}>
                {item.label}
              </Badge>
            ))}
          </div>

          {preview.errors.length > 0 && (
            <Card className="border-danger/40">
              <CardTitle className="mb-2 text-danger">Filas que no se pudieron leer</CardTitle>
              <ul className="flex flex-col gap-1 text-sm">
                {preview.errors.map((error) => (
                  <li key={error.line}>
                    <span className="font-medium">Fila {error.line}:</span> {error.messages.join(" · ")}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {preview.rows.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th className="w-16">Fila</Th>
                  <Th>Persona</Th>
                  <Th>{columns.detail}</Th>
                  <Th className="hidden md:table-cell">{columns.extra}</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.key} className={row.status === "error" ? "bg-danger-soft/40" : ""}>
                    <Td className="tabular-nums text-muted">{row.lines.join(", ")}</Td>
                    <Td>
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-xs text-muted">DNI {row.dni}</span>
                    </Td>
                    <Td className="text-sm">{row.detail}</Td>
                    <Td className="hidden text-sm md:table-cell">
                      {row.extra.length === 0
                        ? "—"
                        : row.extra.map((line) => (
                            <span key={line} className="block">
                              {line}
                            </span>
                          ))}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_BADGE[row.status].tone}>{STATUS_BADGE[row.status].label}</Badge>
                      {row.status !== "nuevo" && <span className="mt-1 block text-xs text-muted">{row.messages.join(" · ")}</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" name="mode" value="apply" disabled={pending || preview.applicable === 0}>
              {pending ? "Importando…" : `Importar ${preview.applicable} ${columns.noun}`}
            </Button>
            {preview.summary.some((s) => s.tone === "danger") && (
              <span className="text-sm text-muted">Las filas con errores no se importan. Podés corregirlas y volver a subir el archivo.</span>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
