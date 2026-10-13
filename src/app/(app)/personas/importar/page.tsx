import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { MANAGE_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { STAFF_COLUMNS } from "@/lib/import/staff";
import { IMPORT_COLUMNS } from "@/lib/import/students";
import { cn } from "@/lib/utils";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "Importar personas" };

export default async function ImportarPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireRole(MANAGE_ROLES);
  const kind = (await searchParams).tipo === "personal" ? "personal" : "alumnos";
  const tab = (active: boolean) =>
    cn(
      "rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors",
      active ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Importar personas"
        description="Cargá personas desde una planilla de Excel (.xlsx) o CSV."
        back={{ href: "/personas", label: "Personas" }}
      />
      <nav className="-mt-2 flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.08]" aria-label="Qué importar">
        <Link href="/personas/importar" aria-current={kind === "alumnos" ? "page" : undefined} className={tab(kind === "alumnos")}>
          Alumnos y familias
        </Link>
        <Link href="/personas/importar?tipo=personal" aria-current={kind === "personal" ? "page" : undefined} className={tab(kind === "personal")}>
          Personal
        </Link>
      </nav>

      <Card className="flex flex-col gap-3 text-sm">
        <CardTitle>Cómo armar la planilla</CardTitle>
        {kind === "alumnos" ? (
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>La primera fila tiene los nombres de las columnas. El orden no importa.</li>
            <li>
              Obligatorias: <strong className="text-foreground">apellido, nombre, dni, curso</strong>. El curso se escribe como
              “1° A” o “1A”.
            </li>
            <li>Si un alumno tiene dos adultos responsables, repetí la fila cambiando los datos del tutor.</li>
            <li>Si el legajo queda vacío se usa el DNI. Los alumnos que ya estén registrados se omiten.</li>
          </ul>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Una fila por persona: directivos, preceptores, docentes y administración.</li>
            <li>
              Obligatorias: <strong className="text-foreground">apellido, nombre, dni, rol</strong>. El rol puede ser Directivo,
              Preceptor, Docente o Administrativo; varios se separan con coma (“Preceptor, Docente”).
            </li>
            <li>
              En <strong className="text-foreground">cursos</strong> van los cursos a cargo de cada preceptor (“1° A, 1° B”).
            </li>
            <li>Si la persona ya existe (por ejemplo, un docente que también es padre), se le suman los roles.</li>
          </ul>
        )}
        <p className="text-muted">
          Columnas: {(kind === "alumnos" ? IMPORT_COLUMNS : STAFF_COLUMNS).map((c) => c.key).join(", ")}. Antes de guardar vas a ver
          una vista previa con los errores de cada fila.
        </p>
        <div>
          <a
            href={`/personas/importar/plantilla${kind === "personal" ? "?tipo=personal" : ""}`}
            download
            className="font-medium text-primary hover:underline"
          >
            Descargar planilla modelo (.csv)
          </a>
        </div>
      </Card>

      <ImportFlow key={kind} kind={kind} />
    </div>
  );
}
