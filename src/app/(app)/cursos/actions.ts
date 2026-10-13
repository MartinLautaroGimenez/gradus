"use server";

import { Prisma, type EnrollmentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MANAGE_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { type FormState, fromZodError } from "@/lib/validation";

const courseSchema = z.object({
  grade: z.coerce.number().int().min(1).max(7),
  division: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,3}$/, "Usá una letra o número (A, B, 1…)"),
  shift: z.enum(["MANANA", "TARDE", "VESPERTINO", "NOCHE"]),
  preceptorId: z
    .string()
    .optional()
    .transform((value) => value || null),
});

async function assertPreceptor(preceptorId: string | null) {
  if (!preceptorId) return true;
  const user = await db.user.findUnique({ where: { id: preceptorId }, select: { roles: true, active: true } });
  return !!user?.active && user.roles.includes("PRECEPTOR");
}

const DUPLICATE: FormState = {
  error: "Ya existe ese curso en este ciclo",
  fieldErrors: { division: ["Ya existe"] },
};

export async function createCourse(academicYearId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(MANAGE_ROLES);
  const parsed = courseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  if (!(await assertPreceptor(parsed.data.preceptorId))) return { error: "Preceptor inválido" };

  let courseId: string;
  try {
    const course = await db.course.create({ data: { ...parsed.data, academicYearId } });
    courseId = course.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return DUPLICATE;
    throw error;
  }
  redirect(`/cursos/${courseId}`);
}

export async function updateCourse(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(MANAGE_ROLES);
  const parsed = courseSchema.omit({ grade: true }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  if (!(await assertPreceptor(parsed.data.preceptorId))) return { error: "Preceptor inválido" };

  try {
    await db.course.update({ where: { id }, data: parsed.data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return DUPLICATE;
    throw error;
  }
  revalidatePath(`/cursos/${id}`);
  return { ok: true, message: "Curso actualizado" };
}

export async function deleteCourse(id: string) {
  await requireRole(MANAGE_ROLES);
  const enrolled = await db.enrollment.count({ where: { courseId: id } });
  if (enrolled > 0) redirect(`/cursos/${id}?error=con-alumnos`);
  const course = await db.course.delete({ where: { id } });
  redirect(`/cursos?ciclo=${course.academicYearId}`);
}

// ── Materias del curso ──────────────────────────────────────

export async function addCourseSubject(courseId: string, formData: FormData) {
  await requireRole(MANAGE_ROLES);
  const subjectId = String(formData.get("subjectId") ?? "");
  const [course, subject] = await Promise.all([
    db.course.findUnique({ where: { id: courseId } }),
    db.subject.findUnique({ where: { id: subjectId } }),
  ]);
  if (!course || !subject || subject.grade !== course.grade) return;

  await db.courseSubject.upsert({
    where: { courseId_subjectId: { courseId, subjectId } },
    update: {},
    create: { courseId, subjectId },
  });
  revalidatePath(`/cursos/${courseId}`);
}

/** Agrega todas las materias del plan para el año del curso que todavía no tenga. */
export async function addAllPlanSubjects(courseId: string) {
  await requireRole(MANAGE_ROLES);
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) return;
  const subjects = await db.subject.findMany({ where: { grade: course.grade, level: course.level } });
  await db.courseSubject.createMany({
    data: subjects.map((subject) => ({ courseId, subjectId: subject.id })),
    skipDuplicates: true,
  });
  revalidatePath(`/cursos/${courseId}`);
}

export async function setSubjectTeacher(courseSubjectId: string, formData: FormData) {
  await requireRole(MANAGE_ROLES);
  const teacherId = String(formData.get("teacherId") ?? "") || null;
  if (teacherId) {
    const teacher = await db.user.findUnique({ where: { id: teacherId }, select: { roles: true } });
    if (!teacher?.roles.includes("DOCENTE")) return;
  }
  const updated = await db.courseSubject.update({ where: { id: courseSubjectId }, data: { teacherId } });
  revalidatePath(`/cursos/${updated.courseId}`);
}

export async function removeCourseSubject(courseSubjectId: string) {
  await requireRole(MANAGE_ROLES);
  const removed = await db.courseSubject.delete({ where: { id: courseSubjectId } });
  revalidatePath(`/cursos/${removed.courseId}`);
}

// ── Alumnos del curso ───────────────────────────────────────

export async function enrollStudent(courseId: string, formData: FormData) {
  await requireRole(MANAGE_ROLES);
  const studentId = String(formData.get("studentId") ?? "");
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course || !studentId) return;

  // Un alumno no puede tener dos matrículas activas en el mismo ciclo.
  const active = await db.enrollment.findFirst({
    where: { studentId, status: "ACTIVA", course: { academicYearId: course.academicYearId } },
  });
  if (active) redirect(`/cursos/${courseId}?error=ya-matriculado`);

  const last = await db.enrollment.aggregate({ where: { courseId }, _max: { listNumber: true } });
  await db.enrollment.upsert({
    where: { studentId_courseId: { studentId, courseId } },
    update: { status: "ACTIVA" },
    create: { studentId, courseId, listNumber: (last._max.listNumber ?? 0) + 1 },
  });
  revalidatePath(`/cursos/${courseId}`);
}

const STATUSES: EnrollmentStatus[] = ["ACTIVA", "PASE", "BAJA", "EGRESADO"];

export async function setEnrollmentStatus(enrollmentId: string, formData: FormData) {
  await requireRole(MANAGE_ROLES);
  const status = String(formData.get("status")) as EnrollmentStatus;
  if (!STATUSES.includes(status)) return;
  const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId }, include: { course: true } });
  if (!enrollment) return;

  if (status === "ACTIVA") {
    const other = await db.enrollment.findFirst({
      where: {
        studentId: enrollment.studentId,
        status: "ACTIVA",
        id: { not: enrollmentId },
        course: { academicYearId: enrollment.course.academicYearId },
      },
    });
    if (other) redirect(`/cursos/${enrollment.courseId}?error=ya-matriculado`);
  }
  await db.enrollment.update({ where: { id: enrollmentId }, data: { status } });
  revalidatePath(`/cursos/${enrollment.courseId}`);
}

export async function removeEnrollment(enrollmentId: string) {
  await requireRole(MANAGE_ROLES);
  const removed = await db.enrollment.delete({ where: { id: enrollmentId } });
  revalidatePath(`/cursos/${removed.courseId}`);
}

/** Numera la lista por orden alfabético (apellido, nombre). */
export async function renumberCourse(courseId: string) {
  await requireRole(MANAGE_ROLES);
  const enrollments = await db.enrollment.findMany({
    where: { courseId },
    include: { student: { include: { user: { select: { lastName: true, firstName: true } } } } },
  });
  const sorted = enrollments.sort((a, b) => {
    const nameA = `${a.student.user.lastName} ${a.student.user.firstName}`;
    const nameB = `${b.student.user.lastName} ${b.student.user.firstName}`;
    return nameA.localeCompare(nameB, "es");
  });
  await db.$transaction(
    sorted.map((enrollment, index) =>
      db.enrollment.update({ where: { id: enrollment.id }, data: { listNumber: index + 1 } }),
    ),
  );
  revalidatePath(`/cursos/${courseId}`);
}
