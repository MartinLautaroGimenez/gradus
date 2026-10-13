"use client";

import { useRef } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { useFormAction } from "@/lib/use-form-action";
import { type ImportState, importStudents } from "./actions";

export function ImportFlow() {
  const [state, onSubmit, pending] = useFormAction<ImportState>(importStudents, {});
  const formRef = useRef<HTMLFormElement>(null);
  const preview = state.preview;

  if (state.done) {
    return (
      <Card className="flex flex-col gap-3">
        <CardTitle>Importación terminada</CardTitle>
        <ul className="text-sm">
          <li>{state.done.students} alumnos creados y matriculados</li>
          <li>{state.done.guardians} cuentas de familia creadas</li>
          <li>{state.done.linked} vínculos alumno–familia</li>
        </ul>
        <CardDescription>
          Todos ingresan con su DNI como usuario y contraseña; se les pide cambiarla en el primer ingreso.
        </CardDescription>
        <div className="flex gap-2">
          <Link href="/personas?rol=ALUMNO" className="text-sm font-medium text-primary hover:underline">
            Ver alumnos
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.csv"
          required
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
          // Al cambiar de archivo se vuelve a la vista previa.
          onChange={() => formRef.current?.requestSubmit(formRef.current.querySelector<HTMLButtonElement>("[value=preview]"))}
        />
        <Button type="submit" name="mode" value="preview" variant="secondary" disabled={pending}>
          {pending ? "Leyendo…" : "Revisar archivo"}
        </Button>
      </Card>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      {preview && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="success">{preview.counts.nuevos} alumnos nuevos</Badge>
            <Badge tone="primary">{preview.counts.tutoresNuevos} familias nuevas</Badge>
            {preview.counts.existentes > 0 && <Badge>{preview.counts.existentes} ya registrados</Badge>}
            {preview.counts.errores > 0 && <Badge tone="danger">{preview.counts.errores} con errores</Badge>}
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

          <Table>
            <thead>
              <tr>
                <Th className="w-16">Fila</Th>
                <Th>Alumno</Th>
                <Th>Curso</Th>
                <Th className="hidden md:table-cell">Familia</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.dni} className={row.status === "error" ? "bg-danger-soft/40" : ""}>
                  <Td className="tabular-nums text-muted">{row.lines.join(", ")}</Td>
                  <Td>
                    <span className="font-medium">{row.name}</span>
                    <span className="block text-xs text-muted">DNI {row.dni}</span>
                  </Td>
                  <Td>{row.course}</Td>
                  <Td className="hidden text-sm md:table-cell">
                    {row.guardians.length === 0
                      ? "—"
                      : row.guardians.map((g) => (
                          <span key={g.dni} className="block">
                            {g.name} {g.existing && <span className="text-xs text-muted">(ya registrado)</span>}
                          </span>
                        ))}
                  </Td>
                  <Td>
                    <Badge tone={row.status === "nuevo" ? "success" : row.status === "error" ? "danger" : "neutral"}>
                      {row.status === "nuevo" ? "Nuevo" : row.status === "error" ? "Error" : "Se omite"}
                    </Badge>
                    {row.status === "error" && (
                      <span className="mt-1 block text-xs text-danger">{row.messages.join(" · ")}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" name="mode" value="apply" disabled={pending || preview.counts.nuevos === 0}>
              {pending ? "Importando…" : `Importar ${preview.counts.nuevos} alumnos`}
            </Button>
            {preview.counts.errores > 0 && (
              <span className="text-sm text-muted">Las filas con errores no se importan. Podés corregirlas y volver a subir el archivo.</span>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
