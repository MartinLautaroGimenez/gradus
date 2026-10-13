"use server";

import { revalidatePath } from "next/cache";
import { hashInitialPassword } from "@/lib/auth/password";
import { MANAGE_ROLES, canManageUser } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { readSpreadsheet } from "@/lib/import/read-spreadsheet";
import {
  MAX_IMPORT_ROWS,
  type ParsedStudent,
  type RowError,
  parseStudentRecords,
  rowsToRecords,
} from "@/lib/import/students";
import { courseLabel, fullName } from "@/lib/utils";

export type PreviewRow = {
  lines: number[];
  dni: string;
  name: string;
  course: string;
  status: "nuevo" | "existente" | "error";
  messages: string[];
  guardians: { name: string; dni: string; existing: boolean }[];
};

export type ImportState = {
  error?: string;
  preview?: {
    fileName: string;
    rows: PreviewRow[];
    errors: RowError[];
    counts: { nuevos: number; existentes: number; errores: number; tutoresNuevos: number };
  };
  done?: { students: number; guardians: number; linked: number };
};

type Actor = Awaited<ReturnType<typeof requireRole>>;

/** Cruza lo leído de la planilla con la base: cursos, DNI y legajos existentes. */
async function plan(actor: Actor, students: ParsedStudent[]) {
  const year = await db.academicYear.findFirst({ where: { active: true }, include: { courses: true } });
  if (!year) throw new Error("No hay un ciclo lectivo activo. Activalo en Configuración antes de importar.");

  const dnis = [...new Set(students.flatMap((s) => [s.dni, ...s.guardians.map((g) => g.dni)]))];
  const [existingUsers, existingFiles, existingEmails] = await Promise.all([
    db.user.findMany({ where: { dni: { in: dnis } }, include: { studentProfile: true } }),
    db.student.findMany({ where: { fileNumber: { in: students.map((s) => s.fileNumber) } }, select: { fileNumber: true, userId: true } }),
    db.user.findMany({
      where: { email: { in: students.flatMap((s) => [s.email, ...s.guardians.map((g) => g.email)]).filter((e): e is string => !!e) } },
      select: { email: true, dni: true },
    }),
  ]);
  const userByDni = new Map(existingUsers.map((u) => [u.dni, u]));
  const takenFiles = new Map(existingFiles.map((f) => [f.fileNumber, f.userId]));
  const takenEmails = new Map(existingEmails.map((e) => [e.email!, e.dni]));
  const filesInFile = new Map<string, number>();
  for (const s of students) filesInFile.set(s.fileNumber, (filesInFile.get(s.fileNumber) ?? 0) + 1);

  const rows = students.map((student) => {
    const messages: string[] = [];
    const course = year.courses.find((c) => c.grade === student.course.grade && c.division === student.course.division);
    const existing = userByDni.get(student.dni);

    if (!course) messages.push(`No existe el curso ${courseLabel(student.course)} en el ciclo ${year.year}`);
    if (existing && !existing.studentProfile) {
      messages.push(`El DNI ${student.dni} ya pertenece a ${fullName(existing)}, que no es alumno`);
    }
    if (!existing) {
      if (takenFiles.has(student.fileNumber)) messages.push(`El legajo ${student.fileNumber} ya está usado`);
      if ((filesInFile.get(student.fileNumber) ?? 0) > 1) messages.push(`El legajo ${student.fileNumber} está repetido en la planilla`);
      if (student.email && takenEmails.has(student.email)) messages.push(`El email ${student.email} ya está en uso`);
    }
    for (const guardian of student.guardians) {
      const user = userByDni.get(guardian.dni);
      if (user && !canManageUser(actor, { roles: [...user.roles, "TUTOR"] })) {
        messages.push(`No tenés permiso para vincular a ${fullName(user)} como tutor`);
      }
      if (!user && guardian.email && takenEmails.get(guardian.email) && takenEmails.get(guardian.email) !== guardian.dni) {
        messages.push(`El email del tutor ${guardian.email} ya está en uso`);
      }
    }

    const status: PreviewRow["status"] = messages.length ? "error" : existing ? "existente" : "nuevo";
    return {
      student,
      courseId: course?.id,
      status,
      preview: {
        lines: student.lines,
        dni: student.dni,
        name: `${student.lastName}, ${student.firstName}`,
        course: courseLabel(student.course),
        status,
        messages: status === "existente" ? ["Ya está registrado: se omite"] : messages,
        guardians: student.guardians.map((g) => ({
          name: `${g.lastName}, ${g.firstName}`,
          dni: g.dni,
          existing: userByDni.has(g.dni),
        })),
      } satisfies PreviewRow,
    };
  });
  return { rows, userByDni };
}

export async function importStudents(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireRole(MANAGE_ROLES);
  const file = formData.get("file");
  const mode = formData.get("mode") === "apply" ? "apply" : "preview";
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí un archivo" };

  let parsed: ReturnType<typeof parseStudentRecords>;
  try {
    const { records, missingColumns } = rowsToRecords(await readSpreadsheet(file));
    if (missingColumns.length) return { error: `Faltan columnas obligatorias: ${missingColumns.join(", ")}` };
    if (records.length === 0) return { error: "La planilla no tiene filas con datos" };
    if (records.length > MAX_IMPORT_ROWS) return { error: `Máximo ${MAX_IMPORT_ROWS} filas por archivo` };
    parsed = parseStudentRecords(records);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo leer el archivo" };
  }

  let planned: Awaited<ReturnType<typeof plan>>;
  try {
    planned = await plan(actor, parsed.students);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error al validar" };
  }

  const toCreate = planned.rows.filter((row) => row.status === "nuevo");
  const newGuardianDnis = new Set(
    toCreate.flatMap((row) => row.student.guardians.filter((g) => !planned.userByDni.has(g.dni)).map((g) => g.dni)),
  );

  if (mode === "preview") {
    return {
      preview: {
        fileName: file.name,
        rows: planned.rows.map((row) => row.preview),
        errors: parsed.errors,
        counts: {
          nuevos: toCreate.length,
          existentes: planned.rows.filter((row) => row.status === "existente").length,
          errores: planned.rows.filter((row) => row.status === "error").length + parsed.errors.length,
          tutoresNuevos: newGuardianDnis.size,
        },
      },
    };
  }

  // ── Aplicar: sólo las filas válidas y nuevas. Todo o nada. ──
  const hashes = new Map<string, string>();
  for (const dni of [...toCreate.map((row) => row.student.dni), ...newGuardianDnis]) {
    hashes.set(dni, await hashInitialPassword(dni));
  }

  const result = await db.$transaction(
    async (tx) => {
      const guardianIds = new Map<string, string>();
      for (const [dni, user] of planned.userByDni) guardianIds.set(dni, user.id);
      let guardiansCreated = 0;
      let linked = 0;
      const nextListNumber = new Map<string, number>();

      for (const { student, courseId } of toCreate) {
        if (!nextListNumber.has(courseId!)) {
          const last = await tx.enrollment.aggregate({ where: { courseId }, _max: { listNumber: true } });
          nextListNumber.set(courseId!, last._max.listNumber ?? 0);
        }
        const listNumber = nextListNumber.get(courseId!)! + 1;
        nextListNumber.set(courseId!, listNumber);

        const user = await tx.user.create({
          data: {
            dni: student.dni,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            roles: ["ALUMNO"],
            passwordHash: hashes.get(student.dni)!,
            mustChangePassword: true,
            studentProfile: {
              create: {
                fileNumber: student.fileNumber,
                birthDate: student.birthDate,
                enrollments: { create: { courseId: courseId!, listNumber } },
              },
            },
          },
          include: { studentProfile: true },
        });

        for (const guardian of student.guardians) {
          let guardianId = guardianIds.get(guardian.dni);
          if (!guardianId) {
            const created = await tx.user.create({
              data: {
                dni: guardian.dni,
                firstName: guardian.firstName,
                lastName: guardian.lastName,
                email: guardian.email,
                phone: guardian.phone,
                roles: ["TUTOR"],
                passwordHash: hashes.get(guardian.dni)!,
                mustChangePassword: true,
              },
            });
            guardianId = created.id;
            guardianIds.set(guardian.dni, guardianId);
            guardiansCreated++;
          } else {
            const existing = await tx.user.findUniqueOrThrow({ where: { id: guardianId }, select: { roles: true } });
            if (!existing.roles.includes("TUTOR")) {
              await tx.user.update({ where: { id: guardianId }, data: { roles: { push: "TUTOR" } } });
            }
          }
          await tx.studentGuardian.create({
            data: {
              studentId: user.studentProfile!.id,
              guardianId,
              relationship: guardian.relationship,
              isPrimary: student.guardians[0] === guardian,
            },
          });
          linked++;
        }
      }
      return { students: toCreate.length, guardians: guardiansCreated, linked };
    },
    { timeout: 120_000 },
  );

  revalidatePath("/personas");
  revalidatePath("/cursos");
  return { done: result };
}
