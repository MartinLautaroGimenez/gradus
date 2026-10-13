/**
 * Datos de prueba para desarrollo. Borra todo y vuelve a cargar.
 * Todos los usuarios tienen la contraseña "gradus123".
 */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { defaultPeriods } from "../src/lib/periods";

const db = new PrismaClient();
const PASSWORD = "gradus123";

const FIRST_NAMES = [
  "Valentina", "Mateo", "Martina", "Benjamín", "Sofía", "Thiago", "Catalina", "Joaquín", "Emma", "Santino",
  "Mía", "Bautista", "Isabella", "Felipe", "Julieta", "Lautaro", "Camila", "Tomás", "Lucía", "Agustín",
  "Delfina", "Facundo", "Renata", "Ignacio",
];
const LAST_NAMES = [
  "González", "Rodríguez", "Fernández", "López", "Martínez", "Pérez", "Gómez", "Sánchez", "Romero", "Sosa",
  "Álvarez", "Torres", "Ruiz", "Ramírez", "Flores", "Acosta", "Benítez", "Medina", "Herrera", "Suárez",
  "Aguirre", "Giménez", "Molina", "Castro",
];

const SUBJECTS: Record<number, string[]> = {
  1: ["Matemática", "Lengua y Literatura", "Inglés", "Historia", "Geografía", "Biología", "Educación Física", "Educación Tecnológica", "Dibujo Técnico"],
  4: ["Matemática", "Lengua y Literatura", "Inglés", "Física", "Química", "Programación", "Sistemas Digitales", "Redes", "Educación Física"],
};

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("El seed borra la base: no se corre en producción.");
  }

  console.log("Limpiando base…");
  await db.$transaction([
    db.notification.deleteMany(),
    db.attachment.deleteMany(),
    db.announcement.deleteMany(),
    db.attendanceRecord.deleteMany(),
    db.grade.deleteMany(),
    db.assessment.deleteMany(),
    db.enrollment.deleteMany(),
    db.studentGuardian.deleteMany(),
    db.student.deleteMany(),
    db.courseSubject.deleteMany(),
    db.course.deleteMany(),
    db.subject.deleteMany(),
    db.gradingPeriod.deleteMany(),
    db.academicYear.deleteMany(),
    db.session.deleteMany(),
    db.user.deleteMany(),
    db.school.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  let dniCounter = 40_000_000;
  const user = (email: string, firstName: string, lastName: string, roles: Role[]) =>
    db.user.create({
      data: { email, firstName, lastName, roles, passwordHash, dni: String(dniCounter++) },
    });

  await db.school.create({ data: { name: "Escuela Técnica de la Universidad de Mendoza", shortName: "ETec" } });

  const periods = defaultPeriods(2026);
  const year = await db.academicYear.create({
    data: {
      year: 2026,
      startDate: periods[0].startDate,
      endDate: periods.at(-1)!.endDate,
      active: true,
      periods: { create: periods },
    },
  });

  console.log("Creando personal…");
  await user("admin@gradus.local", "Admin", "Gradus", ["SUPERADMIN"]);
  await user("directora@gradus.local", "Laura", "Bustos", ["DIRECTIVO"]);
  await user("administracion@gradus.local", "Silvia", "Ortiz", ["ADMINISTRATIVO"]);
  const preceptor = await user("preceptor@gradus.local", "Diego", "Quiroga", ["PRECEPTOR"]);
  const teachers = await Promise.all([
    user("docente@gradus.local", "Carolina", "Vega", ["DOCENTE"]),
    user("jmorales@gradus.local", "Javier", "Morales", ["DOCENTE"]),
    user("pnavarro@gradus.local", "Paula", "Navarro", ["DOCENTE"]),
    // Docente que además es madre de un alumno: muestra el caso de varios roles.
    user("acabrera@gradus.local", "Andrea", "Cabrera", ["DOCENTE", "TUTOR"]),
  ]);

  console.log("Creando cursos y materias…");
  const courseSpecs = [
    { grade: 1, division: "A" },
    { grade: 1, division: "B" },
    { grade: 4, division: "A" },
  ];
  const courses = [];
  for (const spec of courseSpecs) {
    const course = await db.course.create({
      data: { ...spec, academicYearId: year.id, preceptorId: preceptor.id },
    });
    courses.push(course);
    for (const [i, name] of SUBJECTS[spec.grade].entries()) {
      const subject = await db.subject.upsert({
        where: { level_grade_name: { level: "SECUNDARIO", grade: spec.grade, name } },
        update: {},
        create: { name, grade: spec.grade },
      });
      await db.courseSubject.create({
        data: { courseId: course.id, subjectId: subject.id, teacherId: teachers[i % teachers.length].id },
      });
    }
  }

  console.log("Creando alumnos y familias…");
  let n = 0;
  const studentsByCourse: string[][] = [];
  for (const course of courses) {
    const ids: string[] = [];
    for (let listNumber = 1; listNumber <= 8; listNumber++, n++) {
      const firstName = FIRST_NAMES[n % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(n * 7) % LAST_NAMES.length];
      const email = n === 0 ? "alumno@gradus.local" : `alumno${n}@gradus.local`;
      const studentUser = await user(email, firstName, lastName, ["ALUMNO"]);
      const student = await db.student.create({
        data: {
          userId: studentUser.id,
          fileNumber: `L-${String(1001 + n)}`,
          birthDate: new Date(course.grade === 1 ? "2014-05-10" : "2011-05-10"),
          enrollments: { create: { courseId: course.id, listNumber } },
        },
      });
      ids.push(student.id);
    }
    studentsByCourse.push(ids);
  }

  // Una familia con dos hijos en cursos distintos.
  const family = await user("familia@gradus.local", "Marcela", "Domínguez", ["TUTOR"]);
  await db.studentGuardian.createMany({
    data: [
      { studentId: studentsByCourse[0][0], guardianId: family.id, relationship: "MADRE", isPrimary: true },
      { studentId: studentsByCourse[2][0], guardianId: family.id, relationship: "MADRE", isPrimary: true },
    ],
  });
  await db.studentGuardian.create({
    data: { studentId: studentsByCourse[1][2], guardianId: teachers[3].id, relationship: "MADRE", isPrimary: true },
  });

  // El resto de los alumnos también tiene un adulto responsable.
  const linked = new Set([studentsByCourse[0][0], studentsByCourse[2][0], studentsByCourse[1][2]]);
  const ADULT_NAMES = ["Laura", "Gustavo", "Carla", "Pablo", "Verónica", "Martín", "Natalia", "Sergio", "Florencia", "Diego"];
  let adult = 0;
  for (const studentId of studentsByCourse.flat()) {
    if (linked.has(studentId)) continue;
    const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { user: true } });
    const firstName = ADULT_NAMES[adult % ADULT_NAMES.length];
    const guardian = await user(`tutor${adult + 1}@gradus.local`, firstName, student.user.lastName, ["TUTOR"]);
    await db.studentGuardian.create({
      data: { studentId, guardianId: guardian.id, relationship: adult % 2 === 0 ? "MADRE" : "PADRE", isPrimary: true },
    });
    adult++;
  }

  console.log("Cargando notas…");
  await seedGrades(year.id);
  console.log("Cargando asistencia…");
  await seedAttendance(year.id);
  console.log("Cargando comunicados…");
  await seedAnnouncements();

  console.log(`Listo. Contraseña de todos los usuarios: ${PASSWORD}`);
}

/** Generador pseudoaleatorio determinístico: el seed da siempre los mismos datos. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

/**
 * 1° cuatrimestre completo y cerrado; 2° cuatrimestre en curso con un trabajo
 * práctico cargado. Cada alumno tiene un "nivel" para que haya de todo: buenos
 * promedios, algunos que se llevan materias a diciembre y algún ausente.
 */
async function seedGrades(academicYearId: string) {
  const periods = await db.gradingPeriod.findMany({ where: { academicYearId }, orderBy: { order: "asc" } });
  const [first, second] = periods;
  const sheets = await db.courseSubject.findMany({
    where: { course: { academicYearId } },
    include: { course: { include: { enrollments: true } } },
  });
  const rand = random(42);
  const level = new Map<string, number>();

  for (const sheet of sheets) {
    const plan = [
      { periodId: first.id, title: "TP 1", kind: "TRABAJO_PRACTICO" as const, weight: 1, date: "2026-04-10", fill: 1 },
      { periodId: first.id, title: "Parcial", kind: "EXAMEN" as const, weight: 2, date: "2026-05-15", fill: 1 },
      { periodId: first.id, title: "Concepto", kind: "CONCEPTO" as const, weight: 1, date: "2026-07-01", fill: 1 },
      { periodId: second.id, title: "TP 1", kind: "TRABAJO_PRACTICO" as const, weight: 1, date: "2026-08-20", fill: 0.6 },
    ];
    for (const [position, item] of plan.entries()) {
      const assessment = await db.assessment.create({
        data: {
          courseSubjectId: sheet.id,
          periodId: item.periodId,
          title: item.title,
          kind: item.kind,
          weight: item.weight,
          date: new Date(item.date),
          position: position + 1,
        },
      });
      const grades = sheet.course.enrollments
        .filter(() => rand() < item.fill)
        .map((enrollment) => {
          if (!level.has(enrollment.id)) level.set(enrollment.id, 5 + rand() * 4.5);
          const absent = rand() < 0.04;
          const value = Math.min(10, Math.max(1, Math.round(level.get(enrollment.id)! + (rand() - 0.5) * 4)));
          return { assessmentId: assessment.id, enrollmentId: enrollment.id, absent, value: absent ? null : value };
        });
      await db.grade.createMany({ data: grades });
    }
  }
  await db.gradingPeriod.update({ where: { id: first.id }, data: { closed: true } });
}

/** Asistencia de marzo a principios de octubre; algunos alumnos cerca del tope. */
async function seedAttendance(academicYearId: string) {
  const rand = random(7);
  const enrollments = await db.enrollment.findMany({
    where: { course: { academicYearId } },
    orderBy: [{ courseId: "asc" }, { listNumber: "asc" }],
  });
  const days: Date[] = [];
  for (let d = new Date("2026-03-02"); d <= new Date("2026-10-09"); d = new Date(d.getTime() + 86400000)) {
    const weekday = d.getUTCDay();
    // Sin fines de semana ni receso invernal.
    if (weekday !== 0 && weekday !== 6 && !(d >= new Date("2026-07-13") && d <= new Date("2026-07-24"))) days.push(d);
  }
  const data = enrollments.flatMap((enrollment, i) => {
    const frequent = i % 8 === 3; // un alumno por curso falta seguido
    return days.map((date) => {
      const x = rand();
      const absentRate = frequent ? 0.11 : 0.035;
      const status =
        x < absentRate ? "AUSENTE" : x < absentRate + 0.03 ? "TARDE" : x < absentRate + 0.04 ? "RETIRO" : "PRESENTE";
      const justified = status === "AUSENTE" && rand() < 0.3;
      return {
        enrollmentId: enrollment.id,
        date,
        status: status as "AUSENTE" | "TARDE" | "RETIRO" | "PRESENTE",
        justified,
        note: justified ? "Certificado médico" : null,
      };
    });
  });
  await db.attendanceRecord.createMany({ data });
}

async function seedAnnouncements() {
  const director = await db.user.findUniqueOrThrow({ where: { email: "directora@gradus.local" } });
  const preceptor = await db.user.findUniqueOrThrow({ where: { email: "preceptor@gradus.local" } });
  const families = await db.user.findMany({ where: { roles: { has: "TUTOR" } }, select: { id: true } });
  const course = await db.course.findFirstOrThrow({ where: { grade: 1, division: "A" } });
  // Alumnos de 1° A y sus familias.
  const courseStudents = await db.user.findMany({
    where: {
      OR: [
        { studentProfile: { enrollments: { some: { courseId: course.id } } } },
        { guardianOf: { some: { student: { enrollments: { some: { courseId: course.id } } } } } },
      ],
    },
    select: { id: true },
  });

  const welcome = await db.announcement.create({
    data: {
      title: "Bienvenidos a Gradus",
      body: "Desde ahora las notas, la asistencia y los comunicados de la escuela están en Gradus.\n\nActiven las notificaciones desde la campana para enterarse de todo al instante.",
      authorId: director.id,
      targetRoles: ["TUTOR"],
      requiresAck: true,
      createdAt: new Date("2026-10-01T12:00:00Z"),
      recipients: { createMany: { data: families.map((f) => ({ userId: f.id })) } },
    },
  });
  const trip = await db.announcement.create({
    data: {
      title: "Salida al Museo de Ciencias — 1° A",
      body: "El viernes 23 de octubre 1° A visita el Museo de Ciencias. Salimos 8:30 y volvemos 12:30. Traer vianda y la autorización firmada.",
      authorId: preceptor.id,
      targetRoles: ["TUTOR", "ALUMNO"],
      createdAt: new Date("2026-10-09T15:00:00Z"),
      courses: { create: { courseId: course.id } },
      recipients: { createMany: { data: courseStudents.map((s) => ({ userId: s.id })) } },
    },
  });
  await db.notification.createMany({
    data: [
      ...families.map((f) => ({
        userId: f.id,
        kind: "COMUNICADO" as const,
        title: `Comunicado (requiere notificarse): ${welcome.title}`,
        link: `/comunicados/${welcome.id}`,
        createdAt: welcome.createdAt,
      })),
      ...courseStudents.map((st) => ({
        userId: st.id,
        kind: "COMUNICADO" as const,
        title: `Comunicado: ${trip.title}`,
        link: `/comunicados/${trip.id}`,
        createdAt: trip.createdAt,
      })),
    ],
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
