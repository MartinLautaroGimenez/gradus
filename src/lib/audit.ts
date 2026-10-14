import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/request-info";

export type AuditEntry = {
  /** Quién hizo la acción (null si no hay sesión, por ejemplo un ingreso fallido). */
  actorId: string | null;
  /** Código corto y estable: "login.ok", "notas.guardar", "persona.roles"… */
  action: string;
  entity?: string;
  entityId?: string;
  /** Texto para mostrar en el registro de auditoría. */
  summary: string;
  details?: Prisma.InputJsonValue;
};

/**
 * Registro de auditoría. Nunca tira error: si no se puede escribir, se avisa
 * en el log del servidor y la acción del usuario sigue su curso.
 */
export async function audit(entry: AuditEntry) {
  try {
    let ip: string | null = null;
    try {
      ip = await clientIp();
    } catch {
      // Fuera de una request (scripts, tareas en segundo plano).
    }
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        summary: entry.summary.slice(0, 500),
        details: entry.details,
        ip,
      },
    });
  } catch (error) {
    console.error("[auditoría] no se pudo registrar", entry.action, error);
  }
}
