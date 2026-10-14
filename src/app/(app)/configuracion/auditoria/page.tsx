import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CONFIG_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Registro de auditoría" };

const PAGE_SIZE = 50;

/** Grupos de acciones (por el prefijo del código). */
const CATEGORIES: Record<string, string> = {
  login: "Ingresos",
  contrasena: "Contraseñas",
  "2fa": "Verificación en dos pasos",
  sesion: "Sesiones",
  persona: "Personas y roles",
  familia: "Familias",
  importar: "Importaciones",
  notas: "Notas",
  asistencia: "Asistencia",
  matricula: "Matrículas",
  convivencia: "Convivencia",
  comunicado: "Comunicados",
  config: "Configuración",
};

const dateTime = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/Argentina/Mendoza",
});

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; q?: string; pagina?: string }>;
}) {
  await requireRole(CONFIG_ROLES);
  const params = await searchParams;
  const category = params.tipo && params.tipo in CATEGORIES ? params.tipo : "";
  const query = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.pagina ?? "1", 10) || 1));

  const where: Prisma.AuditLogWhereInput = {
    ...(category ? { action: { startsWith: `${category}.` } } : {}),
    ...(category === "login" ? { action: { in: ["login.ok", "login.fallido", "login.2fa_fallido", "logout"] } } : {}),
    ...(query
      ? {
          OR: [
            { summary: { contains: query, mode: "insensitive" } },
            { ip: { startsWith: query } },
            { actor: { OR: [{ lastName: { contains: query, mode: "insensitive" } }, { dni: query }] } },
          ],
        }
      : {}),
  };

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (target: number) => {
    const search = new URLSearchParams({ ...(category ? { tipo: category } : {}), ...(query ? { q: query } : {}), pagina: String(target) });
    return `/configuracion/auditoria?${search}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Registro de auditoría"
        description="Quién hizo qué y cuándo: ingresos, cambios de notas y asistencia, permisos y configuración."
        back={{ href: "/configuracion", label: "Configuración" }}
      />

      <form className="flex flex-wrap gap-2" role="search">
        <Select name="tipo" defaultValue={category} aria-label="Tipo" className="w-auto">
          <option value="">Todo</option>
          {Object.entries(CATEGORIES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Input name="q" defaultValue={query} placeholder="Buscar por texto, apellido, DNI o IP" aria-label="Buscar" className="min-w-0 flex-1" />
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
        {entries.length === 0 && <li className="px-5 py-4 text-sm text-muted">No hay registros con esos filtros.</li>}
        {entries.map((entry) => (
          <li key={entry.id} className="px-5 py-3">
            <p className="text-[15px]">{entry.summary}</p>
            <p className="text-sm text-muted">
              {dateTime.format(entry.createdAt)}
              {" · "}
              {entry.actor ? (
                <Link href={`/personas/${entry.actor.id}`} className="text-primary">
                  {entry.actor.firstName} {entry.actor.lastName}
                </Link>
              ) : (
                "Sin sesión"
              )}
              {entry.ip ? ` · IP ${entry.ip}` : ""}
              <span className="ml-1 font-mono text-[12px]">{entry.action}</span>
            </p>
            {entry.details !== null && (
              <details className="mt-1">
                <summary className="cursor-pointer text-sm text-primary">Detalle</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-surface-muted p-3 text-[12px]">
                  {JSON.stringify(entry.details, null, 2)}
                </pre>
              </details>
            )}
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-[15px]" aria-label="Páginas">
          {page > 1 ? <Link href={link(page - 1)} className="text-primary">Anteriores</Link> : <span />}
          <span className="text-muted">
            Página {page} de {pages}
          </span>
          {page < pages ? <Link href={link(page + 1)} className="text-primary">Siguientes</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
