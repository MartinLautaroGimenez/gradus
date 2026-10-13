"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canTakeAttendance } from "@/lib/attendance-server";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { parseDate } from "@/lib/validation";

const rowsSchema = z
  .array(
    z.object({
      enrollmentId: z.string(),
      status: z.enum(["PRESENTE", "AUSENTE", "TARDE", "RETIRO"]),
      justified: z.boolean(),
      note: z.string().trim().max(200).nullable(),
    }),
  )
  .max(200);

type Result = { ok: true } | { ok: false; error: string };

async function authorize(courseId: string, isoDate: string) {
  const user = await requireUser();
  const course = await db.course.findUnique({ where: { id: courseId }, include: { academicYear: true } });
  if (!course || !canTakeAttendance(user, course)) return { ok: false as const, error: "No tenés permiso para tomar lista en este curso" };
  const date = parseDate(isoDate);
  if (!date) return { ok: false as const, error: "Fecha inválida" };
  if (date < course.academicYear.startDate || date > course.academicYear.endDate) {
    return { ok: false as const, error: "La fecha está fuera del ciclo lectivo" };
  }
  return { ok: true as const, user, course, date };
}

export async function saveAttendance(
  courseId: string,
  isoDate: string,
  rawRows: z.input<typeof rowsSchema>,
): Promise<Result> {
  const auth = await authorize(courseId, isoDate);
  if (!auth.ok) return auth;
  const parsed = rowsSchema.safeParse(rawRows);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const valid = new Set(
    (
      await db.enrollment.findMany({
        where: { courseId, status: "ACTIVA", id: { in: parsed.data.map((r) => r.enrollmentId) } },
        select: { id: true },
      })
    ).map((e) => e.id),
  );
  if (parsed.data.some((r) => !valid.has(r.enrollmentId))) {
    return { ok: false, error: "La lista cambió mientras la cargabas. Recargá la página." };
  }

  await db.$transaction(
    parsed.data.map((row) => {
      // Un presente no lleva justificación ni nota.
      const data = {
        status: row.status,
        justified: row.status === "PRESENTE" ? false : row.justified,
        note: row.status === "PRESENTE" ? null : row.note || null,
        recordedById: auth.user.id,
      };
      return db.attendanceRecord.upsert({
        where: { enrollmentId_date: { enrollmentId: row.enrollmentId, date: auth.date } },
        update: data,
        create: { enrollmentId: row.enrollmentId, date: auth.date, ...data },
      });
    }),
  );
  revalidatePath("/asistencia", "layout");
  return { ok: true };
}

/** Borra la lista de un día (por si se tomó en la fecha equivocada). */
export async function deleteAttendanceDay(courseId: string, isoDate: string): Promise<Result> {
  const auth = await authorize(courseId, isoDate);
  if (!auth.ok) return auth;
  await db.attendanceRecord.deleteMany({ where: { date: auth.date, enrollment: { courseId } } });
  revalidatePath("/asistencia", "layout");
  return { ok: true };
}
