import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { MANAGE_ROLES, assignableRoles } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { courseLabel } from "@/lib/utils";
import { createPerson } from "../actions";
import { PersonForm } from "../person-form";

export const metadata: Metadata = { title: "Nueva persona" };

export default async function NuevaPersonaPage() {
  const user = await requireRole(MANAGE_ROLES);
  const courses = await db.course.findMany({
    where: { academicYear: { active: true } },
    orderBy: [{ grade: "asc" }, { division: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Nueva persona"
        description="Se genera una contraseña inicial al azar que se muestra al crear la cuenta; se le pide cambiarla en el primer ingreso."
        back={{ href: "/personas", label: "Personas" }}
      />
      <Card>
        <PersonForm
          action={createPerson}
          assignableRoles={assignableRoles(user)}
          courses={courses.map((course) => ({ id: course.id, label: courseLabel(course) }))}
          submitLabel="Crear"
        />
      </Card>
    </div>
  );
}
