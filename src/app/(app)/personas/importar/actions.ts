"use server";

import type { Course, Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { generateInitialPassword } from "@/lib/auth/initial-password";
import { hashInitialPassword } from "@/lib/auth/password";
import { LIMITS, hit, minutesLeft } from "@/lib/auth/rate-limit";
import { MANAGE_ROLES, assignableRoles, canManageUser } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { readSpreadsheet } from "@/lib/import/read-spreadsheet";
import { type ParsedStaff, STAFF_COLUMNS, parseStaffRecords } from "@/lib/import/staff";
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  type ParsedStudent,
  type RowError,
  parseStudentRecords,
  readRecords,
} from "@/lib/import/students";
import { courseLabel, fullName } from "@/lib/utils";

export type PreviewRow = {
  key: string;
  lines: number[];
  dni: string;
  name: string;
  /** Curso (alumnos) o roles (personal). */
  detail: string;
  /** Familia (alumnos) o cursos a cargo (personal). */
  extra: string[];
  status: "nuevo" | "actualizar" | "existente" | "error";
  messages: string[];
};

export type ImportState = {
  error?: string;
  preview?: {
    fileName: string;
    rows: PreviewRow[];
    errors: RowError[];
    summary: { label: string; tone: "success" | "primary" | "neutral" | "danger" }[];
    /** Cuántas filas se van a aplicar. */
    applicable: number;
  };
  done?: {
    lines: string[];
    /** Contraseñas iniciales de las cuentas creadas: se descargan una sola vez. */
    credentials: { name: string; dni: string; role: string; password: string }[];
  };
};

/** Genera y hashea contraseñas iniciales al azar para cada DNI. */
async function initialPasswords(dnis: Iterable<string>) {
  const passwords = new Map<string, { password: string; hash: string }>();
  for (const dni of dnis) {
    if (passwords.has(dni)) continue;
    const password = generateInitialPassword();
    passwords.set(dni, { password, hash: await hashInitialPassword(password) });
  }
  return passwords;
}

type Actor = Awaited<ReturnType<typeof requireRole>>;
type CourseRef = { grade: number; division: string };
const courseKey = (c: CourseRef) => `${c.grade}|${c.division}`;

async function activeYear() {
  const year = await db.academicYear.findFirst({ where: { active: true }, include: { courses: true } });
  if (!year) throw new Error("No hay un ciclo lectivo activo. Crealo o activalo en Configuración antes de importar.");
  return year;
}

function findCourse(courses: Course[], ref: CourseRef) {
  return courses.find((c) => c.level === "SECUNDARIO" && c.grade === ref.grade && c.division === ref.division);
}

/** Crea (si hace falta) los cursos pedidos en el ciclo activo y devuelve su id por curso. */
async function ensureCourses(tx: Prisma.TransactionClient, yearId: string, refs: CourseRef[]) {
  const ids = new Map<string, string>();
  for (const ref of refs) {
    if (ids.has(courseKey(ref))) continue;
    const course = await tx.course.upsert({
      where: { academicYearId_level_grade_division: { academicYearId: yearId, level: "SECUNDARIO", grade: ref.grade, division: ref.division } },
      update: {},
      create: { academicYearId: yearId, grade: ref.grade, division: ref.division },
    });
    ids.set(courseKey(ref), course.id);
  }
  return ids;
}

async function readUpload<K extends string>(formData: FormData, columns: readonly { key: K; required: boolean }[]) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Elegí un archivo");
  const { records, missingColumns } = readRecords(await readSpreadsheet(file), columns);
  if (missingColumns.length) throw new Error(`Faltan columnas obligatorias: ${missingColumns.join(", ")}`);
  if (records.length === 0) throw new Error("La planilla no tiene filas con datos");
  if (records.length > MAX_IMPORT_ROWS) throw new Error(`Máximo ${MAX_IMPORT_ROWS} filas por archivo`);
  return { file, records };
}

export async function importPeople(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireRole(MANAGE_ROLES);
  const kind = formData.get("kind") === "personal" ? "personal" : "alumnos";
  const apply = formData.get("mode") === "apply";
  const createCourses = formData.get("createCourses") === "on";
  const limitKey = `importar:${actor.id}`;
  if (!hit(limitKey, LIMITS.imports)) return { error: `Demasiadas importaciones seguidas. Esperá ${minutesLeft(limitKey)} min.` };
  try {
    return kind === "personal"
      ? await importStaff(actor, formData, apply, createCourses)
      : await importStudents(actor, formData, apply, createCourses);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo procesar el archivo" };
  }
}

// ─────────────────────────────────────────────────────────────
// Alumnos y familias
// ─────────────────────────────────────────────────────────────

async function planStudents(actor: Actor, students: ParsedStudent[], createCourses: boolean) {
  const year = await activeYear();
  const dnis = [...new Set(students.flatMap((s) => [s.dni, ...s.guardians.map((g) => g.dni)]))];
  const [existingUsers, existingFiles, existingEmails] = await Promise.all([
    db.user.findMany({ where: { dni: { in: dnis } }, include: { studentProfile: true } }),
    db.student.findMany({ where: { fileNumber: { in: students.map((s) => s.fileNumber) } }, select: { fileNumber: true } }),
    db.user.findMany({
      where: { email: { in: students.flatMap((s) => [s.email, ...s.guardians.map((g) => g.email)]).filter((e): e is string => !!e) } },
      select: { email: true, dni: true },
    }),
  ]);
  const userByDni = new Map(existingUsers.map((u) => [u.dni, u]));
  const takenFiles = new Set(existingFiles.map((f) => f.fileNumber));
  const takenEmails = new Map(existingEmails.map((e) => [e.email!, e.dni]));
  const filesInFile = new Map<string, number>();
  for (const s of students) filesInFile.set(s.fileNumber, (filesInFile.get(s.fileNumber) ?? 0) + 1);

  const rows = students.map((student) => {
    const messages: string[] = [];
    const course = findCourse(year.courses, student.course);
    const existing = userByDni.get(student.dni);

    if (!course && !createCourses) {
      messages.push(`No existe el curso ${courseLabel(student.course)} en el ciclo ${year.year} (podés tildar "Crear los cursos que falten")`);
    }
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
    const preview: PreviewRow = {
      key: student.dni,
      lines: student.lines,
      dni: student.dni,
      name: `${student.lastName}, ${student.firstName}`,
      detail: `${courseLabel(student.course)}${!course && createCourses ? " (curso nuevo)" : ""}`,
      extra: student.guardians.map((g) => `${g.lastName}, ${g.firstName}${userByDni.has(g.dni) ? " (ya registrado)" : ""}`),
      status,
      messages: status === "existente" ? ["Ya está registrado: se omite"] : messages,
    };
    return { student, status, preview };
  });
  return { year, rows, userByDni };
}

async function importStudents(actor: Actor, formData: FormData, apply: boolean, createCourses: boolean): Promise<ImportState> {
  const { file, records } = await readUpload(formData, IMPORT_COLUMNS);
  const parsed = parseStudentRecords(records);
  const planned = await planStudents(actor, parsed.students, createCourses);

  const toCreate = planned.rows.filter((row) => row.status === "nuevo");
  const newGuardianDnis = new Set(
    toCreate.flatMap((row) => row.student.guardians.filter((g) => !planned.userByDni.has(g.dni)).map((g) => g.dni)),
  );
  const newCourses = new Set(
    toCreate.filter((r) => !findCourse(planned.year.courses, r.student.course)).map((r) => courseKey(r.student.course)),
  );
  const errors = planned.rows.filter((r) => r.status === "error").length + parsed.errors.length;
  const existing = planned.rows.filter((r) => r.status === "existente").length;

  if (!apply) {
    return {
      preview: {
        fileName: file.name,
        rows: planned.rows.map((r) => r.preview),
        errors: parsed.errors,
        applicable: toCreate.length,
        summary: [
          { label: `${toCreate.length} alumnos nuevos`, tone: "success" },
          { label: `${newGuardianDnis.size} familias nuevas`, tone: "primary" },
          ...(newCourses.size ? [{ label: `${newCourses.size} cursos nuevos`, tone: "primary" as const }] : []),
          ...(existing ? [{ label: `${existing} ya registrados`, tone: "neutral" as const }] : []),
          ...(errors ? [{ label: `${errors} con errores`, tone: "danger" as const }] : []),
        ],
      },
    };
  }

  // Aplicar: sólo las filas válidas y nuevas. Todo o nada.
  const passwords = await initialPasswords([...toCreate.map((row) => row.student.dni), ...newGuardianDnis]);

  const result = await db.$transaction(
    async (tx) => {
      const courseIds = await ensureCourses(tx, planned.year.id, toCreate.map((r) => r.student.course));
      const guardianIds = new Map<string, string>();
      for (const [dni, user] of planned.userByDni) guardianIds.set(dni, user.id);
      let guardiansCreated = 0;
      let linked = 0;
      const nextListNumber = new Map<string, number>();

      for (const { student } of toCreate) {
        const courseId = courseIds.get(courseKey(student.course))!;
        if (!nextListNumber.has(courseId)) {
          const last = await tx.enrollment.aggregate({ where: { courseId }, _max: { listNumber: true } });
          nextListNumber.set(courseId, last._max.listNumber ?? 0);
        }
        const listNumber = nextListNumber.get(courseId)! + 1;
        nextListNumber.set(courseId, listNumber);

        const user = await tx.user.create({
          data: {
            dni: student.dni,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            roles: ["ALUMNO"],
            passwordHash: passwords.get(student.dni)!.hash,
            mustChangePassword: true,
            studentProfile: {
              create: {
                fileNumber: student.fileNumber,
                birthDate: student.birthDate,
                enrollments: { create: { courseId, listNumber } },
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
                passwordHash: passwords.get(guardian.dni)!.hash,
                mustChangePassword: true,
              },
            });
            guardianId = created.id;
            guardianIds.set(guardian.dni, guardianId);
            guardiansCreated++;
          } else {
            const current = await tx.user.findUniqueOrThrow({ where: { id: guardianId }, select: { roles: true } });
            if (!current.roles.includes("TUTOR")) {
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
      return { guardiansCreated, linked };
    },
    { timeout: 120_000 },
  );

  revalidatePath("/personas");
  revalidatePath("/cursos");
  const guardianNames = new Map(toCreate.flatMap((r) => r.student.guardians.map((g) => [g.dni, `${g.lastName}, ${g.firstName}`] as const)));
  await audit({
    actorId: actor.id,
    action: "importar.alumnos",
    summary: `Importó ${toCreate.length} alumnos y ${result.guardiansCreated} familias desde "${file.name}"`,
  });
  return {
    done: {
      credentials: [
        ...toCreate.map((r) => ({ name: `${r.student.lastName}, ${r.student.firstName}`, dni: r.student.dni, role: "Alumno", password: passwords.get(r.student.dni)!.password })),
        ...[...newGuardianDnis].map((dni) => ({ name: guardianNames.get(dni) ?? dni, dni, role: "Familia", password: passwords.get(dni)!.password })),
      ],
      lines: [
        `${toCreate.length} alumnos creados y matriculados`,
        `${result.guardiansCreated} cuentas de familia creadas`,
        `${result.linked} vínculos alumno–familia`,
        ...(newCourses.size ? [`${newCourses.size} cursos creados`] : []),
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Personal
// ─────────────────────────────────────────────────────────────

async function planStaff(actor: Actor, staff: ParsedStaff[], createCourses: boolean) {
  const anyCourses = staff.some((s) => s.courses.length > 0);
  const year = anyCourses ? await activeYear() : null;
  const preceptors = year?.courses.flatMap((c) => (c.preceptorId ? [c.preceptorId] : [])) ?? [];
  const [existingUsers, currentPreceptors, existingEmails] = await Promise.all([
    db.user.findMany({ where: { dni: { in: staff.map((s) => s.dni) } } }),
    db.user.findMany({ where: { id: { in: preceptors } }, select: { id: true, firstName: true, lastName: true } }),
    db.user.findMany({
      where: { email: { in: staff.map((s) => s.email).filter((e): e is string => !!e) } },
      select: { email: true, dni: true },
    }),
  ]);
  const userByDni = new Map(existingUsers.map((u) => [u.dni, u]));
  const preceptorName = new Map(currentPreceptors.map((p) => [p.id, fullName(p)]));
  const takenEmails = new Map(existingEmails.map((e) => [e.email!, e.dni]));
  const allowed = assignableRoles(actor);

  const rows = staff.map((person) => {
    const messages: string[] = [];
    const existing = userByDni.get(person.dni);
    const forbidden = person.roles.filter((r) => !allowed.includes(r));
    if (forbidden.length) messages.push(`No podés otorgar el rol ${forbidden.map((r) => ROLE_LABELS[r]).join(", ")}`);
    const roles: Role[] = [...new Set([...(existing?.roles ?? []), ...person.roles])];
    if (existing && !canManageUser(actor, { roles })) messages.push(`No tenés permiso para modificar a ${fullName(existing)}`);
    if (person.email && takenEmails.has(person.email) && takenEmails.get(person.email) !== person.dni) {
      messages.push(`El email ${person.email} ya está en uso`);
    }

    const extra = person.courses.map((ref) => {
      const course = year ? findCourse(year.courses, ref) : undefined;
      if (!course) {
        if (!createCourses) messages.push(`No existe el curso ${courseLabel(ref)} (podés tildar "Crear los cursos que falten")`);
        return `Preceptor/a de ${courseLabel(ref)} (curso nuevo)`;
      }
      const current = course.preceptorId && course.preceptorId !== existing?.id ? preceptorName.get(course.preceptorId) : null;
      return `Preceptor/a de ${courseLabel(ref)}${current ? ` (reemplaza a ${current})` : ""}`;
    });

    const changes = !existing || person.roles.some((r) => !existing.roles.includes(r)) || person.courses.length > 0;
    const status: PreviewRow["status"] = messages.length ? "error" : !existing ? "nuevo" : changes ? "actualizar" : "existente";
    const preview: PreviewRow = {
      key: person.dni,
      lines: [person.line],
      dni: person.dni,
      name: `${person.lastName}, ${person.firstName}`,
      detail: person.roles.map((r) => ROLE_LABELS[r]).join(" · "),
      extra,
      status,
      messages:
        status === "existente"
          ? ["Ya está registrado con esos roles: se omite"]
          : status === "actualizar"
            ? [`Ya existe: se le suman los roles${person.courses.length ? " y los cursos" : ""}`]
            : messages,
    };
    return { person, existing, roles, status, preview };
  });
  return { year, rows };
}

async function importStaff(actor: Actor, formData: FormData, apply: boolean, createCourses: boolean): Promise<ImportState> {
  const { file, records } = await readUpload(formData, STAFF_COLUMNS);
  const parsed = parseStaffRecords(records);
  const planned = await planStaff(actor, parsed.staff, createCourses);
  const toCreate = planned.rows.filter((r) => r.status === "nuevo");
  const toUpdate = planned.rows.filter((r) => r.status === "actualizar");
  const errors = planned.rows.filter((r) => r.status === "error").length + parsed.errors.length;
  const existing = planned.rows.filter((r) => r.status === "existente").length;
  const newCourses = new Set(
    [...toCreate, ...toUpdate].flatMap((r) =>
      r.person.courses.filter((c) => !planned.year || !findCourse(planned.year.courses, c)).map(courseKey),
    ),
  );

  if (!apply) {
    return {
      preview: {
        fileName: file.name,
        rows: planned.rows.map((r) => r.preview),
        errors: parsed.errors,
        applicable: toCreate.length + toUpdate.length,
        summary: [
          { label: `${toCreate.length} personas nuevas`, tone: "success" },
          ...(toUpdate.length ? [{ label: `${toUpdate.length} se actualizan`, tone: "primary" as const }] : []),
          ...(newCourses.size ? [{ label: `${newCourses.size} cursos nuevos`, tone: "primary" as const }] : []),
          ...(existing ? [{ label: `${existing} sin cambios`, tone: "neutral" as const }] : []),
          ...(errors ? [{ label: `${errors} con errores`, tone: "danger" as const }] : []),
        ],
      },
    };
  }

  const passwords = await initialPasswords(toCreate.map((r) => r.person.dni));

  await db.$transaction(
    async (tx) => {
      const courseIds = planned.year
        ? await ensureCourses(tx, planned.year.id, [...toCreate, ...toUpdate].flatMap((r) => r.person.courses))
        : new Map<string, string>();
      for (const { person, existing, roles } of [...toCreate, ...toUpdate]) {
        const user = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: { roles, email: existing.email ?? person.email, phone: existing.phone ?? person.phone },
            })
          : await tx.user.create({
              data: {
                dni: person.dni,
                firstName: person.firstName,
                lastName: person.lastName,
                email: person.email,
                phone: person.phone,
                roles,
                passwordHash: passwords.get(person.dni)!.hash,
                mustChangePassword: true,
              },
            });
        for (const ref of person.courses) {
          await tx.course.update({ where: { id: courseIds.get(courseKey(ref))! }, data: { preceptorId: user.id } });
        }
      }
    },
    { timeout: 120_000 },
  );

  revalidatePath("/personas");
  revalidatePath("/cursos");
  const assigned = [...toCreate, ...toUpdate].reduce((sum, r) => sum + r.person.courses.length, 0);
  await audit({
    actorId: actor.id,
    action: "importar.personal",
    summary: `Importó ${toCreate.length} personas nuevas y actualizó ${toUpdate.length} desde "${file.name}"`,
    details: { updated: toUpdate.map((r) => ({ dni: r.person.dni, roles: r.roles })) },
  });
  return {
    done: {
      credentials: toCreate.map((r) => ({
        name: `${r.person.lastName}, ${r.person.firstName}`,
        dni: r.person.dni,
        role: r.roles.map((role) => ROLE_LABELS[role]).join(" / "),
        password: passwords.get(r.person.dni)!.password,
      })),
      lines: [
        `${toCreate.length} personas creadas`,
        ...(toUpdate.length ? [`${toUpdate.length} personas actualizadas`] : []),
        ...(assigned ? [`${assigned} cursos con preceptor asignado`] : []),
        ...(newCourses.size ? [`${newCourses.size} cursos creados`] : []),
      ],
    },
  };
}
