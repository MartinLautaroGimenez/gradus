import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { MANAGE_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createSubject } from "./actions";
import { SubjectForm } from "./subject-form";

export const metadata: Metadata = { title: "Materias" };

export default async function MateriasPage() {
  await requireRole(MANAGE_ROLES);
  const subjects = await db.subject.findMany({
    orderBy: [{ grade: "asc" }, { name: "asc" }],
    include: { _count: { select: { courseSubjects: true } } },
  });
  const grades = [...new Set(subjects.map((subject) => subject.grade))];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Materias" description="Plan de estudios por año. Después se asignan a cada curso desde Cursos." />

      <Card>
        <CardTitle className="mb-3">Agregar materia</CardTitle>
        <SubjectForm action={createSubject} submitLabel="Agregar" />
      </Card>

      {grades.map((grade) => (
        <section key={grade} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{grade}° año</h2>
          <Table>
            <thead>
              <tr>
                <Th>Materia</Th>
                <Th className="hidden sm:table-cell">Abreviatura</Th>
                <Th className="hidden sm:table-cell">Hs. semanales</Th>
                <Th>Cursos</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {subjects
                .filter((subject) => subject.grade === grade)
                .map((subject) => (
                  <tr key={subject.id}>
                    <Td className="font-medium">{subject.name}</Td>
                    <Td className="hidden text-muted sm:table-cell">{subject.shortName ?? "—"}</Td>
                    <Td className="hidden tabular-nums text-muted sm:table-cell">{subject.weeklyHours ?? "—"}</Td>
                    <Td className="tabular-nums">{subject._count.courseSubjects}</Td>
                    <Td className="text-right">
                      <Link href={`/materias/${subject.id}`} className="text-sm font-medium text-primary hover:underline">
                        Editar
                      </Link>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </section>
      ))}
    </div>
  );
}
