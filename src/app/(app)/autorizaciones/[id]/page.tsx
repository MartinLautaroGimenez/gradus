import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Td, Th } from "@/components/ui/table";
import { todayInMendoza } from "@/lib/attendance";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { managedCourses } from "@/lib/scope";
import { courseLabel, fullName } from "@/lib/utils";
import { RemindButton } from "@/components/remind-button";
import { deleteAuthorization, remindAuthorization, respondAuthorization } from "../actions";
import { ResponseForm } from "./response-form";

export const metadata: Metadata = { title: "Autorización" };

const longDate = (d: Date) => d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dateTime = (d: Date) =>
  d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Mendoza" });

export default async function AutorizacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creada?: string; filtro?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { creada, filtro } = await searchParams;
  const request = await db.authorizationRequest.findUnique({
    where: { id },
    include: {
      createdBy: true,
      courses: {
        include: {
          course: {
            include: {
              enrollments: {
                where: { status: "ACTIVA" },
                include: { student: { include: { user: true, guardians: true } } },
                orderBy: { listNumber: "asc" },
              },
            },
          },
        },
      },
      responses: { include: { guardian: true } },
    },
  });
  if (!request) notFound();

  const enrollments = request.courses.flatMap((c) => c.course.enrollments.map((e) => ({ ...e, course: c.course })));
  const myChildren = enrollments.filter((e) => e.student.guardians.some((g) => g.guardianId === user.id));
  const asStudent = enrollments.find((e) => e.student.userId === user.id);
  const managedIds = new Set((await managedCourses(user)).map((c) => c.id));
  const seesTracking = hasAnyRole(user, STAFF_ROLES) || request.createdById === user.id || request.courses.some((c) => managedIds.has(c.courseId));
  const canManage = request.createdById === user.id || hasAnyRole(user, STAFF_ROLES);
  if (!seesTracking && myChildren.length === 0 && !asStudent) notFound();
  await db.notification.updateMany({ where: { userId: user.id, link: `/autorizaciones/${id}`, readAt: null }, data: { readAt: new Date() } });

  const responseFor = (enrollmentId: string) => request.responses.find((r) => r.enrollmentId === enrollmentId);
  const expired = !!request.deadline && request.deadline.toISOString().slice(0, 10) < todayInMendoza();
  const yes = request.responses.filter((r) => r.authorized).length;
  const pendingCount = enrollments.length - request.responses.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={request.title}
        back={{ href: "/autorizaciones", label: "Autorizaciones" }}
        description={`${request.courses.map((c) => courseLabel(c.course)).join(", ")}${request.createdBy ? ` · Pedido por ${fullName(request.createdBy)}` : ""}`}
      />
      {creada && (
        <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          Se pidió la autorización a las familias de {enrollments.length} alumnos.
        </p>
      )}

      <Card className="flex flex-col gap-3 text-sm">
        <p className="whitespace-pre-line">{request.description}</p>
        {request.eventDate && (
          <p className="flex items-center gap-2 first-letter:uppercase">
            <CalendarDays className="size-4 text-muted" aria-hidden /> Actividad: {longDate(request.eventDate)}
          </p>
        )}
        {request.deadline && (
          <p className="flex items-center gap-2">
            <Clock className="size-4 text-muted" aria-hidden /> Responder hasta el {longDate(request.deadline)}
            {expired && <Badge tone="danger">Vencido</Badge>}
          </p>
        )}
      </Card>

      {myChildren.map((child) => {
        const response = responseFor(child.id);
        return (
          <Card key={child.id} className="flex flex-col gap-3">
            <CardTitle>
              {child.student.user.firstName} · {courseLabel(child.course)}
            </CardTitle>
            {response && (
              <p className="text-sm">
                <Badge tone={response.authorized ? "success" : "neutral"}>{response.authorized ? "Autorizado" : "No autorizado"}</Badge>{" "}
                <span className="text-muted">
                  por {response.guardian ? fullName(response.guardian) : "—"} el {dateTime(response.respondedAt)}
                </span>
              </p>
            )}
            {expired ? (
              !response && <p className="text-sm text-danger">Venció el plazo sin respuesta. Comunicate con la escuela.</p>
            ) : (
              <ResponseForm
                action={respondAuthorization.bind(null, id)}
                enrollmentId={child.id}
                name={child.student.user.firstName}
                current={response ? { authorized: response.authorized, comment: response.comment } : undefined}
              />
            )}
          </Card>
        );
      })}

      {asStudent && !seesTracking && (
        <Card className="text-sm">
          Respuesta de tu familia:{" "}
          {(() => {
            const r = responseFor(asStudent.id);
            return r ? <Badge tone={r.authorized ? "success" : "neutral"}>{r.authorized ? "Autorizado" : "No autorizado"}</Badge> : <Badge tone="warning">Sin responder</Badge>;
          })()}
        </Card>
      )}

      {seesTracking && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Respuestas</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="success">{yes} autorizados</Badge>
            <Badge>{request.responses.length - yes} no autorizados</Badge>
            <Badge tone="warning">{pendingCount} sin responder</Badge>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <RemindButton action={remindAuthorization.bind(null, id)} pendingCount={pendingCount} />
              <div className="flex gap-3 text-sm">
                <Link href={`/autorizaciones/${id}`} className={filtro ? "text-muted hover:underline" : "font-medium text-primary"}>
                  Todos
                </Link>
                <Link href={`/autorizaciones/${id}?filtro=pendientes`} className={filtro ? "font-medium text-primary" : "text-muted hover:underline"}>
                  Sin responder
                </Link>
              </div>
            </div>
          )}
          <Table>
            <thead>
              <tr>
                <Th>Alumno</Th>
                <Th>Curso</Th>
                <Th>Respuesta</Th>
                <Th className="hidden md:table-cell">Quién y cuándo</Th>
                <Th className="hidden md:table-cell">Comentario</Th>
              </tr>
            </thead>
            <tbody>
              {enrollments
                .filter((e) => filtro !== "pendientes" || !responseFor(e.id))
                .map((e) => {
                  const r = responseFor(e.id);
                  return (
                    <tr key={e.id}>
                      <Td className="font-medium">{fullName(e.student.user)}</Td>
                      <Td>{courseLabel(e.course)}</Td>
                      <Td>
                        {r ? (
                          <Badge tone={r.authorized ? "success" : "neutral"}>{r.authorized ? "Sí" : "No"}</Badge>
                        ) : (
                          <Badge tone="warning">Sin responder</Badge>
                        )}
                      </Td>
                      <Td className="hidden text-sm text-muted md:table-cell">
                        {r ? `${r.guardian ? fullName(r.guardian) : "—"} · ${dateTime(r.respondedAt)}` : "—"}
                      </Td>
                      <Td className="hidden text-sm md:table-cell">{r?.comment ?? ""}</Td>
                    </tr>
                  );
                })}
            </tbody>
          </Table>
          {canManage && (
            <form action={deleteAuthorization.bind(null, id)}>
              <SubmitButton variant="ghost" className="text-danger" confirm="¿Eliminar el pedido y todas sus respuestas?" pendingText="Eliminando…">
                Eliminar pedido
              </SubmitButton>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
