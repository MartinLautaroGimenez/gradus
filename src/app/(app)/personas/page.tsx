import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { MANAGE_ROLES } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDni } from "@/lib/format";
import { fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Personas" };

const PAGE_SIZE = 25;
const ROLE_KEYS = Object.keys(ROLE_LABELS) as Role[];

type Search = { q?: string; rol?: string; estado?: string; pagina?: string };

export default async function PersonasPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(MANAGE_ROLES);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const role = ROLE_KEYS.includes(params.rol as Role) ? (params.rol as Role) : undefined;
  const inactive = params.estado === "inactivos";
  const page = Math.max(1, Number(params.pagina) || 1);

  const digits = q.replace(/\D/g, "");
  const where: Prisma.UserWhereInput = {
    active: !inactive,
    ...(role ? { roles: { has: role } } : {}),
    ...(q
      ? {
          OR: [
            // Cada palabra tiene que aparecer en el nombre o el apellido ("ana pérez").
            {
              AND: q.split(/\s+/).map((term) => ({
                OR: [
                  { firstName: { contains: term, mode: "insensitive" as const } },
                  { lastName: { contains: term, mode: "insensitive" as const } },
                ],
              })),
            },
            ...(digits.length >= 3 ? [{ dni: { contains: digits } }] : []),
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, people] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (role) search.set("rol", role);
    if (inactive) search.set("estado", "inactivos");
    search.set("pagina", String(target));
    return `/personas?${search}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Personas"
        description="Alumnos, familias y personal de la escuela"
        actions={
          <>
            <LinkButton href="/personas/importar" variant="secondary">
              Importar personas
            </LinkButton>
            <LinkButton href="/personas/nueva">Nueva persona</LinkButton>
          </>
        }
      />

      <form className="flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre, DNI o email" className="max-w-xs flex-1" aria-label="Buscar" />
        <Select name="rol" defaultValue={role ?? ""} className="w-48" aria-label="Rol">
          <option value="">Todos los roles</option>
          {ROLE_KEYS.map((key) => (
            <option key={key} value={key}>
              {ROLE_LABELS[key]}
            </option>
          ))}
        </Select>
        <Select name="estado" defaultValue={inactive ? "inactivos" : ""} className="w-36" aria-label="Estado">
          <option value="">Activos</option>
          <option value="inactivos">Inactivos</option>
        </Select>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {people.length === 0 ? (
        <Card className="text-sm text-muted">No se encontraron personas.</Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>DNI</Th>
              <Th className="hidden md:table-cell">Email</Th>
              <Th>Roles</Th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id} className="hover:bg-surface-muted">
                <Td className="font-medium">
                  <Link href={`/personas/${person.id}`} className="hover:text-primary hover:underline">
                    {fullName(person)}
                  </Link>
                </Td>
                <Td className="tabular-nums">{formatDni(person.dni)}</Td>
                <Td className="hidden text-muted md:table-cell">{person.email ?? "—"}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {person.roles.map((r) => (
                      <Badge key={r} tone={r === "ALUMNO" ? "primary" : r === "TUTOR" ? "success" : "neutral"}>
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          {total} {total === 1 ? "persona" : "personas"}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-3">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="text-primary hover:underline">
                Anterior
              </Link>
            )}
            <span>
              Página {page} de {pages}
            </span>
            {page < pages && (
              <Link href={pageHref(page + 1)} className="text-primary hover:underline">
                Siguiente
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
