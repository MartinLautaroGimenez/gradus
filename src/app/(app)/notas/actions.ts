"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { parseGradeInput } from "@/lib/grades";
import { canEditGrades } from "@/lib/grading/permissions";
import { type AssessmentDTO, ASSESSMENT_KIND_LABELS, cellKey } from "@/lib/grading/types";
import { parseDate } from "@/lib/validation";

type Fail = { ok: false; error: string };

/** Verifica que la persona pueda editar la planilla y que el período esté abierto. */
async function authorizeSheet(courseSubjectId: string, periodId: string) {
  const user = await requireUser();
  const sheet = await db.courseSubject.findUnique({ where: { id: courseSubjectId }, include: { course: true } });
  if (!sheet || !canEditGrades(user, sheet)) return { ok: false, error: "No tenés permiso para cargar notas en esta materia" } as Fail;
  const period = await db.gradingPeriod.findUnique({ where: { id: periodId } });
  if (!period || period.academicYearId !== sheet.course.academicYearId) return { ok: false, error: "Período inválido" } as Fail;
  if (period.closed) return { ok: false, error: `El período ${period.name} está cerrado: no se pueden modificar notas` } as Fail;
  return { ok: true as const, user, sheet, period };
}

function toDTO(a: { id: string; title: string; kind: AssessmentDTO["kind"]; date: Date | null; weight: unknown }): AssessmentDTO {
  return { id: a.id, title: a.title, kind: a.kind, date: a.date ? a.date.toISOString().slice(0, 10) : null, weight: Number(a.weight) };
}

const changesSchema = z
  .array(z.object({ assessmentId: z.string(), enrollmentId: z.string(), value: z.string().max(20) }))
  .max(5000);

export type SaveResult = { ok: true; saved: number } | { ok: false; error: string; cellErrors?: Record<string, string> };

/** Guarda un lote de celdas. Todo o nada: si una celda es inválida no se guarda ninguna. */
export async function saveGrades(
  courseSubjectId: string,
  periodId: string,
  rawChanges: { assessmentId: string; enrollmentId: string; value: string }[],
): Promise<SaveResult> {
  const auth = await authorizeSheet(courseSubjectId, periodId);
  if (!auth.ok) return auth;
  const parsed = changesSchema.safeParse(rawChanges);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const changes = parsed.data;
  if (changes.length === 0) return { ok: true, saved: 0 };

  const [assessments, enrollments] = await Promise.all([
    db.assessment.findMany({
      where: { id: { in: [...new Set(changes.map((c) => c.assessmentId))] }, courseSubjectId, periodId },
      select: { id: true },
    }),
    db.enrollment.findMany({
      where: { id: { in: [...new Set(changes.map((c) => c.enrollmentId))] }, courseId: auth.sheet.courseId, status: "ACTIVA" },
      select: { id: true },
    }),
  ]);
  const validAssessments = new Set(assessments.map((a) => a.id));
  const validEnrollments = new Set(enrollments.map((e) => e.id));

  const cellErrors: Record<string, string> = {};
  const operations = [];
  for (const change of changes) {
    const key = cellKey(change.assessmentId, change.enrollmentId);
    if (!validAssessments.has(change.assessmentId) || !validEnrollments.has(change.enrollmentId)) {
      cellErrors[key] = "La evaluación o el alumno ya no están en esta planilla";
      continue;
    }
    const input = parseGradeInput(change.value);
    const where = { assessmentId_enrollmentId: { assessmentId: change.assessmentId, enrollmentId: change.enrollmentId } };
    if (input.kind === "invalid") {
      cellErrors[key] = input.message;
    } else if (input.kind === "empty") {
      operations.push(db.grade.deleteMany({ where: { assessmentId: change.assessmentId, enrollmentId: change.enrollmentId } }));
    } else {
      const data = {
        value: input.kind === "value" ? input.value : null,
        absent: input.kind === "absent",
        updatedById: auth.user.id,
      };
      operations.push(db.grade.upsert({ where, update: data, create: { ...where.assessmentId_enrollmentId, ...data } }));
    }
  }

  if (Object.keys(cellErrors).length > 0) {
    return { ok: false, error: "Hay celdas con errores; no se guardó nada de este lote", cellErrors };
  }
  await db.$transaction(operations);
  revalidatePath(`/notas/${courseSubjectId}`);
  return { ok: true, saved: changes.length };
}

export async function createAssessment(
  courseSubjectId: string,
  periodId: string,
): Promise<{ ok: true; assessment: AssessmentDTO } | Fail> {
  const auth = await authorizeSheet(courseSubjectId, periodId);
  if (!auth.ok) return auth;

  const count = await db.assessment.count({ where: { courseSubjectId, periodId } });
  const last = await db.assessment.aggregate({ where: { courseSubjectId, periodId }, _max: { position: true } });
  const isCompensatory = auth.period.kind === "COMPENSATORIO";
  const assessment = await db.assessment.create({
    data: {
      courseSubjectId,
      periodId,
      title: isCompensatory ? `Mesa de ${auth.period.name.toLowerCase()}` : `Evaluación ${count + 1}`,
      kind: "EXAMEN",
      position: (last._max.position ?? 0) + 1,
      createdById: auth.user.id,
    },
  });
  revalidatePath(`/notas/${courseSubjectId}`);
  return { ok: true, assessment: toDTO(assessment) };
}

const assessmentSchema = z.object({
  title: z.string().trim().min(1, "Poné un nombre").max(60, "Máximo 60 caracteres"),
  kind: z.enum(Object.keys(ASSESSMENT_KIND_LABELS) as [AssessmentDTO["kind"], ...AssessmentDTO["kind"][]]),
  date: z
    .string()
    .nullable()
    .transform((value, ctx) => {
      if (!value) return null;
      const date = parseDate(value);
      if (!date) {
        ctx.addIssue({ code: "custom", message: "Fecha inválida" });
        return z.NEVER;
      }
      return date;
    }),
  weight: z.number().min(0.1, "El peso mínimo es 0,1").max(100, "Peso demasiado alto"),
});

export async function updateAssessment(
  id: string,
  input: { title: string; kind: string; date: string | null; weight: number },
): Promise<{ ok: true; assessment: AssessmentDTO } | Fail> {
  const existing = await db.assessment.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "La evaluación no existe" };
  const auth = await authorizeSheet(existing.courseSubjectId, existing.periodId);
  if (!auth.ok) return auth;

  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const assessment = await db.assessment.update({ where: { id }, data: parsed.data });
  revalidatePath(`/notas/${existing.courseSubjectId}`);
  return { ok: true, assessment: toDTO(assessment) };
}

export async function deleteAssessment(id: string): Promise<{ ok: true } | Fail> {
  const existing = await db.assessment.findUnique({ where: { id } });
  if (!existing) return { ok: true };
  const auth = await authorizeSheet(existing.courseSubjectId, existing.periodId);
  if (!auth.ok) return auth;
  await db.assessment.delete({ where: { id } });
  revalidatePath(`/notas/${existing.courseSubjectId}`);
  return { ok: true };
}

/** Mueve una columna una posición a la izquierda o a la derecha. */
export async function moveAssessment(id: string, direction: -1 | 1): Promise<{ ok: true } | Fail> {
  const existing = await db.assessment.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "La evaluación no existe" };
  const auth = await authorizeSheet(existing.courseSubjectId, existing.periodId);
  if (!auth.ok) return auth;

  const siblings = await db.assessment.findMany({
    where: { courseSubjectId: existing.courseSubjectId, periodId: existing.periodId },
    orderBy: { position: "asc" },
  });
  const index = siblings.findIndex((a) => a.id === id);
  const other = siblings[index + direction];
  if (!other) return { ok: true };
  // Se renumera todo para evitar posiciones repetidas.
  const reordered = [...siblings];
  [reordered[index], reordered[index + direction]] = [other, existing];
  await db.$transaction(reordered.map((a, i) => db.assessment.update({ where: { id: a.id }, data: { position: i + 1 } })));
  revalidatePath(`/notas/${existing.courseSubjectId}`);
  return { ok: true };
}
