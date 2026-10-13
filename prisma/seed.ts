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

  console.log(`Listo. Contraseña de todos los usuarios: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
