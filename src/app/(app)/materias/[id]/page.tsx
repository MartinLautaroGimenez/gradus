import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { MANAGE_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { deleteSubject, updateSubject } from "../actions";
import { SubjectForm } from "../subject-form";

export const metadata: Metadata = { title: "Editar materia" };

export default async function MateriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole(MANAGE_ROLES);
  const { id } = await params;
  const { error } = await searchParams;
  const subject = await db.subject.findUnique({
    where: { id },
    include: { _count: { select: { courseSubjects: true } } },
  });
  if (!subject) notFound();
  const inUse = subject._count.courseSubjects;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={subject.name} description={`${subject.grade}° año`} back={{ href: "/materias", label: "Materias" }} />

      <Card>
        <SubjectForm action={updateSubject.bind(null, subject.id)} subject={subject} submitLabel="Guardar cambios" />
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>Eliminar materia</CardTitle>
        {inUse > 0 ? (
          <CardDescription>
            Se dicta en {inUse} {inUse === 1 ? "curso" : "cursos"}. Para eliminarla, primero quitala de esos cursos.
          </CardDescription>
        ) : (
          <form action={deleteSubject.bind(null, subject.id)}>
            <SubmitButton
              variant="secondary"
              className="text-danger"
              pendingText="Eliminando…"
              confirm={`¿Eliminar "${subject.name}"?`}
            >
              Eliminar
            </SubmitButton>
          </form>
        )}
        {error === "en-uso" && <p className="text-sm text-danger">No se pudo eliminar: la materia está en uso.</p>}
      </Card>
    </div>
  );
}
