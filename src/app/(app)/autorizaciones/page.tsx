import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { managedCourses } from "@/lib/scope";
import { courseLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Autorizaciones" };

const shortDate = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function AutorizacionesPage() {
  const user = await requireUser();
  const managed = await managedCourses(user);
  const staff = hasAnyRole(user, STAFF_ROLES);

  // Lo que gestiono: lo que creé, o todo si soy del personal.
  const own = managed.length
    ? await db.authorizationRequest.findMany({
        where: staff ? {} : { createdById: user.id },
        include: {
          courses: { include: { course: { include: { _count: { select: { enrollments: { where: { status: "ACTIVA" } } } } } } } },
          responses: { select: { authorized: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];

  // Lo que tengo que responder como familia, por hijo.
  const children = await db.studentGuardian.findMany({
    where: { guardianId: user.id },
    include: { student: { include: { user: true, enrollments: { where: { status: "ACTIVA", course: { academicYear: { active: true } } } } } } },
  });
  const childEnrollments = children.flatMap((c) => c.student.enrollments.map((e) => ({ enrollment: e, name: c.student.user.firstName })));
  const forFamily = childEnrollments.length
    ? await db.authorizationRequest.findMany({
        where: { courses: { some: { courseId: { in: childEnrollments.map((c) => c.enrollment.courseId) } } } },
        include: { courses: true, responses: { where: { enrollmentId: { in: childEnrollments.map((c) => c.enrollment.id) } } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Autorizaciones"
        description="Salidas educativas y permisos firmados por las familias"
        actions={managed.length > 0 && <LinkButton href="/autorizaciones/nueva">Nueva autorización</LinkButton>}
      />

      {forFamily.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Para responder</h2>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {forFamily.map((request) => {
                const mine = childEnrollments.filter((c) => request.courses.some((rc) => rc.courseId === c.enrollment.courseId));
                return (
                  <li key={request.id}>
                    <Link href={`/autorizaciones/${request.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-surface-muted">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{request.title}</span>
                        <span className="block text-sm text-muted">
                          {request.eventDate && `Actividad: ${shortDate(request.eventDate)}`}
                          {request.deadline && ` · Responder hasta el ${shortDate(request.deadline)}`}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {mine.map(({ enrollment, name }) => {
                          const response = request.responses.find((r) => r.enrollmentId === enrollment.id);
                          return (
                            <Badge key={enrollment.id} tone={!response ? "danger" : response.authorized ? "success" : "neutral"}>
                              {name}: {!response ? "sin responder" : response.authorized ? "autorizado" : "no autorizado"}
                            </Badge>
                          );
                        })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {managed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{staff ? "Pedidos de la escuela" : "Mis pedidos"}</h2>
          {own.length === 0 ? (
            <Card className="text-sm text-muted">Todavía no hay pedidos de autorización.</Card>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {own.map((request) => {
                  const total = request.courses.reduce((sum, c) => sum + c.course._count.enrollments, 0);
                  const yes = request.responses.filter((r) => r.authorized).length;
                  const no = request.responses.length - yes;
                  return (
                    <li key={request.id}>
                      <Link href={`/autorizaciones/${request.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-surface-muted">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{request.title}</span>
                          <span className="block text-sm text-muted">
                            {request.courses.map((c) => courseLabel(c.course)).join(", ")}
                            {request.eventDate && ` · ${shortDate(request.eventDate)}`}
                          </span>
                        </span>
                        <span className="flex gap-1.5 text-xs">
                          <Badge tone="success">{yes} sí</Badge>
                          <Badge>{no} no</Badge>
                          <Badge tone="warning">{total - request.responses.length} sin responder</Badge>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </section>
      )}

      {forFamily.length === 0 && managed.length === 0 && <Card className="text-sm text-muted">No hay autorizaciones.</Card>}
    </div>
  );
}
