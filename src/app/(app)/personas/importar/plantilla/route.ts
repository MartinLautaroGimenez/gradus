import { MANAGE_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { IMPORT_COLUMNS } from "@/lib/import/students";

const BOM = String.fromCharCode(0xfeff);

export async function GET() {
  await requireRole(MANAGE_ROLES);
  // ";" y BOM para que Excel en español lo abra con columnas y acentos correctos.
  // Sólo encabezados: una fila de ejemplo terminaría importada por error.
  const csv = BOM + IMPORT_COLUMNS.map((c) => c.key).join(";") + "\r\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gradus-alumnos.csv"',
    },
  });
}
