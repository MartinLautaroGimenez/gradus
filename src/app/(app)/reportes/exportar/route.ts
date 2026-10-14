import { hasAnyRole } from "@/lib/auth/roles";
import { getReadyUser } from "@/lib/auth/session";
import { formatAbsences } from "@/lib/attendance";
import { formatGrade } from "@/lib/grades";
import { isAtRisk, loadSchoolReport } from "@/lib/reports";
import { managedCourses } from "@/lib/scope";

const BOM = String.fromCharCode(0xfeff);

/** Alumnos en riesgo en CSV con ";" (Excel en español lo abre directo). */
export async function GET(request: Request) {
  const user = await getReadyUser();
  if (!user || !hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO", "PRECEPTOR"])) {
    return new Response("No autorizado", { status: 401 });
  }
  const curso = new URL(request.url).searchParams.get("curso");
  const limited = !hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO"]);
  const scope = limited ? (await managedCourses(user)).filter((c) => c.preceptorId === user.id).map((c) => c.id) : undefined;
  const report = await loadSchoolReport(scope);
  if (!report) return new Response("Sin ciclo activo", { status: 404 });

  // Un texto que empieza con =, +, - o @ Excel lo toma como fórmula: se le antepone '.
  const cell = (raw: string) => {
    const v = /^[=+\-@\t\r]/.test(raw) && !/^-?\d/.test(raw) ? `'${raw}` : raw;
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const rows = report.students
    .filter(isAtRisk)
    .filter((s) => !curso || s.courseId === curso)
    .map((s) =>
      [s.name, s.course, s.average === null ? "" : formatGrade(s.average, report.decimals), String(s.failing.length), s.failing.join(", "), formatAbsences(s.absences), String(s.incidents)]
        .map(cell)
        .join(";"),
    );
  const header = ["Alumno", "Curso", "Promedio", "Materias abajo", "Cuáles", "Inasistencias", "Registros de convivencia"].join(";");
  return new Response(BOM + [header, ...rows].join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alumnos-en-riesgo-${report.year.year}.csv"`,
    },
  });
}
