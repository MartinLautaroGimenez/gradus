import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { MANAGE_ROLES, assignableRoles, canManageUser } from "@/lib/auth/permissions";
import { ROLE_LABELS, hasAnyRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ENROLLMENT_STATUS_LABELS, RELATIONSHIP_LABELS, formatDni, toDateInput } from "@/lib/format";
import { courseLabel, fullName } from "@/lib/utils";
import {
  addGuardian,
  removeGuardian,
  resetPassword,
  resetTwoFactor,
  setUserActive,
  updatePerson,
  updateStudentFile,
} from "../actions";
import { PersonForm } from "../person-form";
import { AddGuardianForm, ResetPasswordForm, ResetTwoFactorForm, StudentFileForm } from "./forms";

export const metadata: Metadata = { title: "Persona" };

export default async function PersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(MANAGE_ROLES);
  const { id } = await params;

  const person = await db.user.findUnique({
    where: { id },
    include: {
      studentProfile: {
        include: {
          guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } },
          enrollments: {
            include: { course: { include: { academicYear: true } } },
            orderBy: { course: { academicYear: { year: "desc" } } },
          },
        },
      },
      guardianOf: { include: { student: { include: { user: true } } } },
      teachingAssignments: {
        where: { course: { academicYear: { active: true } } },
        include: { subject: true, course: true },
      },
      preceptorOfCourses: { where: { academicYear: { active: true } }, orderBy: [{ grade: "asc" }, { division: "asc" }] },
    },
  });
  if (!person) notFound();

  const editable = canManageUser(actor, person);
  const isSelf = actor.id === person.id;
  const student = person.studentProfile;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={fullName(person)}
        back={{ href: "/personas", label: "Personas" }}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            DNI {formatDni(person.dni)}
            {person.roles.map((role) => (
              <Badge key={role}>{ROLE_LABELS[role]}</Badge>
            ))}
            {!person.active && <Badge tone="danger">Inactivo</Badge>}
          </span>
        }
      />

      {student && (
        <Link
          href={`/alumnos/${student.id}`}
          className="flex items-center justify-between rounded-2xl bg-surface px-5 py-4 shadow-card hover:bg-surface-muted/60"
        >
          <span>
            <span className="block font-medium">Ficha del alumno</span>
            <span className="block text-[13px] text-muted">Notas, asistencia, convivencia y familia en un solo lugar</span>
          </span>
          <ChevronRight className="size-5 text-muted" aria-hidden />
        </Link>
      )}

      {!editable && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          No tenés permiso para modificar a esta persona.
        </p>
      )}

      <Card>
        <CardTitle className="mb-4">Datos personales</CardTitle>
        {editable ? (
          <PersonForm
            action={updatePerson.bind(null, person.id)}
            person={person}
            assignableRoles={assignableRoles(actor)}
            rolesLocked={isSelf}
            submitLabel="Guardar cambios"
          />
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Email</dt>
              <dd>{person.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Teléfono</dt>
              <dd>{person.phone ?? "—"}</dd>
            </div>
          </dl>
        )}
      </Card>

      {student && (
        <>
          <Card>
            <CardTitle className="mb-4">Legajo</CardTitle>
            {editable && (
              <StudentFileForm
                action={updateStudentFile.bind(null, person.id)}
                student={{ ...student, birthDate: toDateInput(student.birthDate) }}
              />
            )}
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold">Matrículas</h3>
              {student.enrollments.length === 0 ? (
                <CardDescription>
                  Sin matrículas. Se matricula desde la página del <Link href="/cursos" className="text-primary underline">curso</Link>.
                </CardDescription>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {student.enrollments.map((enrollment) => (
                    <li key={enrollment.id} className="flex items-center gap-2">
                      <span className="w-12 tabular-nums text-muted">{enrollment.course.academicYear.year}</span>
                      <Link href={`/cursos/${enrollment.courseId}`} className="font-medium hover:text-primary hover:underline">
                        {courseLabel(enrollment.course)}
                      </Link>
                      <Badge tone={enrollment.status === "ACTIVA" ? "success" : "neutral"}>
                        {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <div>
              <CardTitle>Familia</CardTitle>
              <CardDescription>Adultos responsables que ven la información de este alumno.</CardDescription>
            </div>
            {student.guardians.length > 0 && (
              <ul className="divide-y divide-border rounded-2xl bg-surface-muted">
                {student.guardians.map((link) => (
                  <li key={link.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/personas/${link.guardianId}`} className="font-medium hover:text-primary hover:underline">
                        {fullName(link.guardian)}
                      </Link>
                      <p className="text-xs text-muted">
                        {RELATIONSHIP_LABELS[link.relationship]} · DNI {formatDni(link.guardian.dni)}
                        {link.guardian.phone && ` · ${link.guardian.phone}`}
                        {link.isPrimary && " · Responsable principal"}
                      </p>
                    </div>
                    {editable && (
                      <form action={removeGuardian.bind(null, link.id)}>
                        <SubmitButton
                          variant="ghost"
                          className="h-8 px-2"
                          pendingText="…"
                          confirm={`¿Desvincular a ${fullName(link.guardian)}?`}
                          title="Desvincular"
                        >
                          <X className="size-4" aria-hidden />
                          <span className="sr-only">Desvincular</span>
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {editable && <AddGuardianForm action={addGuardian.bind(null, person.id)} />}
          </Card>
        </>
      )}

      {person.guardianOf.length > 0 && (
        <Card>
          <CardTitle className="mb-3">A cargo de</CardTitle>
          <ul className="flex flex-col gap-1 text-sm">
            {person.guardianOf.map((link) => (
              <li key={link.id}>
                <Link href={`/personas/${link.student.userId}`} className="font-medium hover:text-primary hover:underline">
                  {fullName(link.student.user)}
                </Link>{" "}
                <span className="text-muted">({RELATIONSHIP_LABELS[link.relationship].toLowerCase()})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(person.teachingAssignments.length > 0 || person.preceptorOfCourses.length > 0) && (
        <Card>
          <CardTitle className="mb-3">En el ciclo activo</CardTitle>
          <ul className="flex flex-col gap-1 text-sm">
            {person.preceptorOfCourses.map((course) => (
              <li key={course.id}>
                Preceptor/a de{" "}
                <Link href={`/cursos/${course.id}`} className="font-medium hover:text-primary hover:underline">
                  {courseLabel(course)}
                </Link>
              </li>
            ))}
            {person.teachingAssignments.map((assignment) => (
              <li key={assignment.id}>
                {assignment.subject.name} en{" "}
                <Link href={`/cursos/${assignment.courseId}`} className="font-medium hover:text-primary hover:underline">
                  {courseLabel(assignment.course)}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editable && !isSelf && (
        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle>Cuenta</CardTitle>
            <CardDescription>
              {person.lastLoginAt
                ? `Último ingreso: ${person.lastLoginAt.toLocaleString("es-AR", { timeZone: "America/Argentina/Mendoza" })}`
                : "Todavía no ingresó nunca."}
              {person.mustChangePassword && " Tiene pendiente cambiar la contraseña inicial."}
              {person.totpEnabledAt && " Usa verificación en dos pasos."}
            </CardDescription>
          </div>
          <ResetPasswordForm action={resetPassword.bind(null, person.id)} />
          {person.totpEnabledAt && hasAnyRole(actor, ["SUPERADMIN", "DIRECTIVO"]) && (
            <ResetTwoFactorForm action={resetTwoFactor.bind(null, person.id)} />
          )}
          <form action={setUserActive.bind(null, person.id, !person.active)}>
            <SubmitButton
              variant="secondary"
              className={person.active ? "text-danger" : ""}
              confirm={
                person.active
                  ? `¿Desactivar a ${fullName(person)}? No podrá ingresar hasta que se reactive.`
                  : undefined
              }
              pendingText="Guardando…"
            >
              {person.active ? "Desactivar cuenta" : "Reactivar cuenta"}
            </SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}
