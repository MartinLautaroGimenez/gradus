import { MANAGE_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { STAFF_COLUMNS } from "@/lib/import/staff";
import { IMPORT_COLUMNS } from "@/lib/import/students";

const BOM = String.fromCharCode(0xfeff);

export async function GET(request: Request) {
  await requireRole(MANAGE_ROLES);
  const staff = new URL(request.url).searchParams.get("tipo") === "personal";
  const columns = staff ? STAFF_COLUMNS : IMPORT_COLUMNS;
  // ";" y BOM para que Excel en español lo abra con columnas y acentos correctos.
  // Sólo encabezados: una fila de ejemplo terminaría importada por error.
  const csv = BOM + columns.map((c) => c.key).join(";") + "\r\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gradus-${staff ? "personal" : "alumnos"}.csv"`,
    },
  });
}
