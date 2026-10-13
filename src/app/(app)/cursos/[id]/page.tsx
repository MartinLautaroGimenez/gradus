import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Td, Th } from "@/components/ui/table";
import { COURSE_VIEW_ROLES, MANAGE_ROLES, canViewCourse } from "@/lib/auth/permissions";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ENROLLMENT_STATUS_LABELS, SHIFT_LABELS, formatDni } from "@/lib/format";
import { courseLabel, fullName } from "@/lib/utils";
import {
  addAllPlanSubjects,
  addCourseSubject,
  deleteCourse,
  enrollStudent,
  removeCourseSubject,
  removeEnrollment,
  renumberCourse,
  setEnrollmentStatus,
  setSubjectTeacher,
  updateCourse,
} from "../actions";
import { CourseForm } from "../course-form";

export const metadata: Metadata = { title: "Curso" };

const ERRORS: Record<string, string> = {
  "ya-matriculado": "Ese alumno ya tiene una matrícula activa en otro curso de este ciclo. Primero pasala a Pase o Baja.",
  "con-alumnos": "No se puede eliminar un curso con alumnos matriculados.",
  "materia-con-notas": "Esa materia ya tiene evaluaciones cargadas en este curso. Para no perder notas, no se puede quitar.",
  "alumno-con-notas": "Ese alumno ya tiene notas en este curso. En lugar de quitarlo, cambiá su estado a Pase o Baja.",
};

function RemoveButton({ label }: { label: string }) {
  return (
    <SubmitButton variant="ghost" className="h-8 px-2" pendingText="…" confirm={`¿${label}?`} title={label}>
      <X className="size-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </SubmitButton>
  );
}

export default async function CursoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireRole(COURSE_VIEW_ROLES);
  const { id } = await params;
  const { error } = await searchParams;

  const course = await db.course.findUnique({
    where: { id },
    include: {
      academicYear: true,
      preceptor: true,
      subjects: { include: { subject: true, teacher: true }, orderBy: { subject: { name: "asc" } } },
      enrollments: {
        include: { student: { include: { user: true } } },
        orderBy: [{ listNumber: "asc" }],
      },
    },
  });
  if (!course) notFound();
  if (!canViewCourse(user, course)) redirect("/cursos");
  const canManage = hasAnyRole(user, MANAGE_ROLES);

  const [teachers, preceptors, planSubjects, availableStudents] = canManage
    ? await Promise.all([
        db.user.findMany({ where: { roles: { has: "DOCENTE" }, active: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
        db.user.findMany({ where: { roles: { has: "PRECEPTOR" }, active: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
        db.subject.findMany({ where: { grade: course.grade, level: course.level }, orderBy: { name: "asc" } }),
        // Alumnos sin matrícula activa en este ciclo.
        db.student.findMany({
          where: {
            user: { active: true },
            enrollments: { none: { status: "ACTIVA", course: { academicYearId: course.academicYearId } } },
          },
          include: { user: true },
          orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
        }),
      ])
    : [[], [], [], []];

  const missingSubjects = planSubjects.filter((s) => !course.subjects.some((cs) => cs.subjectId === s.id));
  const activeCount = course.enrollments.filter((e) => e.status === "ACTIVA").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${courseLabel(course)} · ${course.academicYear.year}`}
        description={`Turno ${SHIFT_LABELS[course.shift].toLowerCase()} · ${
          course.preceptor ? `Preceptor/a: ${fullName(course.preceptor)}` : "Sin preceptor asignado"
        }`}
        back={{ href: `/cursos?ciclo=${course.academicYearId}`, label: "Cursos" }}
      />

      {error && ERRORS[error] && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {ERRORS[error]}
        </p>
      )}

      {/* ── Alumnos ── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Alumnos <span className="text-sm font-normal text-muted">({activeCount} activos)</span>
          </h2>
          {canManage && course.enrollments.length > 1 && (
            <form action={renumberCourse.bind(null, course.id)}>
              <SubmitButton variant="secondary" pendingText="Ordenando…">
                Ordenar lista alfabéticamente
              </SubmitButton>
            </form>
          )}
        </div>

        {course.enrollments.length === 0 ? (
          <Card className="text-sm text-muted">Todavía no hay alumnos en este curso.</Card>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-12">N°</Th>
                <Th>Alumno</Th>
                <Th className="hidden sm:table-cell">DNI</Th>
                <Th>Estado</Th>
                {canManage && <Th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {course.enrollments.map((enrollment) => {
                const name = fullName(enrollment.student.user);
                return (
                  <tr key={enrollment.id} className={enrollment.status === "ACTIVA" ? "" : "text-muted"}>
                    <Td className="tabular-nums text-muted">{enrollment.listNumber ?? "—"}</Td>
                    <Td className="font-medium">
                      {canManage ? (
                        <Link href={`/personas/${enrollment.student.userId}`} className="hover:text-primary hover:underline">
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </Td>
                    <Td className="hidden tabular-nums sm:table-cell">{formatDni(enrollment.student.user.dni)}</Td>
                    <Td>
                      {canManage ? (
                        <form action={setEnrollmentStatus.bind(null, enrollment.id)}>
                          <AutoSubmitSelect name="status" defaultValue={enrollment.status} className="h-8 w-32" aria-label={`Estado de ${name}`}>
                            {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </AutoSubmitSelect>
                        </form>
                      ) : (
                        <Badge tone={enrollment.status === "ACTIVA" ? "success" : "neutral"}>
                          {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                        </Badge>
                      )}
                    </Td>
                    {canManage && (
                      <Td>
                        <form action={removeEnrollment.bind(null, enrollment.id)}>
                          <RemoveButton label={`Quitar a ${name} del curso`} />
                        </form>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {canManage && (
          <form action={enrollStudent.bind(null, course.id)} className="flex flex-wrap gap-2">
            <Select name="studentId" required className="max-w-md flex-1" aria-label="Alumno a matricular" defaultValue="">
              <option value="" disabled>
                {availableStudents.length ? "Elegí un alumno sin curso este ciclo…" : "No hay alumnos sin curso este ciclo"}
              </option>
              {availableStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {fullName(student.user)} · DNI {formatDni(student.user.dni)}
                </option>
              ))}
            </Select>
            <SubmitButton variant="secondary" disabled={!availableStudents.length} pendingText="Matriculando…">
              Matricular
            </SubmitButton>
          </form>
        )}
      </section>

      {/* ── Materias ── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Materias y docentes</h2>
        {course.subjects.length === 0 ? (
          <Card className="text-sm text-muted">Este curso todavía no tiene materias.</Card>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Materia</Th>
                <Th>Docente</Th>
                {canManage && <Th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {course.subjects.map((cs) => (
                <tr key={cs.id}>
                  <Td className="font-medium">{cs.subject.name}</Td>
                  <Td>
                    {canManage ? (
                      <form action={setSubjectTeacher.bind(null, cs.id)}>
                        <AutoSubmitSelect
                          name="teacherId"
                          defaultValue={cs.teacherId ?? ""}
                          className="h-8 max-w-xs"
                          aria-label={`Docente de ${cs.subject.name}`}
                        >
                          <option value="">Sin asignar</option>
                          {teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                              {fullName(teacher)}
                            </option>
                          ))}
                        </AutoSubmitSelect>
                      </form>
                    ) : cs.teacher ? (
                      fullName(cs.teacher)
                    ) : (
                      <span className="text-muted">Sin asignar</span>
                    )}
                  </Td>
                  {canManage && (
                    <Td>
                      <form action={removeCourseSubject.bind(null, cs.id)}>
                        <RemoveButton label={`Quitar ${cs.subject.name} del curso`} />
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {canManage && (
          <div className="flex flex-wrap gap-2">
            {missingSubjects.length > 0 && (
              <>
                <form action={addCourseSubject.bind(null, course.id)} className="flex flex-wrap gap-2">
                  <Select name="subjectId" required aria-label="Materia a agregar" defaultValue="" className="w-64">
                    <option value="" disabled>
                      Elegí una materia de {course.grade}° año…
                    </option>
                    {missingSubjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton variant="secondary" pendingText="Agregando…">
                    Agregar
                  </SubmitButton>
                </form>
                <form action={addAllPlanSubjects.bind(null, course.id)}>
                  <SubmitButton variant="secondary" pendingText="Agregando…">
                    Agregar todas las del plan ({missingSubjects.length})
                  </SubmitButton>
                </form>
              </>
            )}
            {planSubjects.length === 0 && (
              <p className="text-sm text-muted">
                No hay materias cargadas para {course.grade}° año.{" "}
                <Link href="/materias" className="text-primary underline">
                  Cargalas en Materias
                </Link>
                .
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Datos del curso ── */}
      {canManage && (
        <Card className="flex flex-col gap-4">
          <CardTitle>Datos del curso</CardTitle>
          <CourseForm
            action={updateCourse.bind(null, course.id)}
            preceptors={preceptors.map((p) => ({ id: p.id, name: fullName(p) }))}
            course={course}
            submitLabel="Guardar cambios"
          />
          <div className="border-t border-border pt-4">
            {course.enrollments.length > 0 ? (
              <CardDescription>Para eliminar el curso primero hay que quitar a todos los alumnos.</CardDescription>
            ) : (
              <form action={deleteCourse.bind(null, course.id)}>
                <SubmitButton variant="secondary" className="text-danger" confirm={`¿Eliminar ${courseLabel(course)}?`} pendingText="Eliminando…">
                  Eliminar curso
                </SubmitButton>
              </form>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
