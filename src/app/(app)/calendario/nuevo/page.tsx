import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { EventKind } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { todayInMendoza } from "@/lib/attendance";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { EVENT_LABELS } from "@/lib/calendar";
import { managedCourses } from "@/lib/scope";
import { courseLabel } from "@/lib/utils";
import { createEvent } from "../actions";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "Agregar evento" };

export default async function NuevoEventoPage() {
  const user = await requireUser();
  const courses = await managedCourses(user);
  if (courses.length === 0) redirect("/calendario");
  const staff = hasAnyRole(user, STAFF_ROLES);
  const kinds = staff ? (Object.keys(EVENT_LABELS) as EventKind[]) : (["EVALUACION", "SALIDA", "REUNION", "ACTO", "OTRO"] as EventKind[]);

  return (
    <div>
      <PageHeader title="Agregar evento" back={{ href: "/calendario", label: "Calendario" }} />
      <Card>
        <EventForm
          action={createEvent}
          kinds={kinds}
          courses={courses.map((c) => ({ id: c.id, label: courseLabel(c) }))}
          canSchoolWide={staff}
          defaultDate={todayInMendoza()}
        />
      </Card>
    </div>
  );
}
