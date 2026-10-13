import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { MANAGE_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { IMPORT_COLUMNS } from "@/lib/import/students";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "Importar alumnos" };

export default async function ImportarPage() {
  await requireRole(MANAGE_ROLES);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Importar alumnos"
        description="Cargá alumnos y familias desde una planilla de Excel (.xlsx) o CSV."
        back={{ href: "/personas", label: "Personas" }}
      />

      <Card className="flex flex-col gap-3 text-sm">
        <CardTitle>Cómo armar la planilla</CardTitle>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>La primera fila tiene los nombres de las columnas. El orden no importa.</li>
          <li>
            Obligatorias: <strong className="text-foreground">apellido, nombre, dni, curso</strong>. El curso se escribe
            como “1° A” o “1A” y tiene que existir en el ciclo activo.
          </li>
          <li>Si un alumno tiene dos adultos responsables, repetí la fila cambiando los datos del tutor.</li>
          <li>Si el legajo queda vacío se usa el DNI. Los alumnos que ya estén registrados se omiten.</li>
          <li>Antes de guardar vas a ver una vista previa con los errores de cada fila.</li>
        </ul>
        <p className="text-muted">
          Columnas: {IMPORT_COLUMNS.map((c) => c.key).join(", ")}.
        </p>
        <div>
          <a href="/personas/importar/plantilla" download className="font-medium text-primary hover:underline">
            Descargar planilla modelo (.csv)
          </a>
        </div>
      </Card>

      <ImportFlow />
    </div>
  );
}
