import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { AUDIENCE_LABELS, sendingScope } from "@/lib/announcements/audience";
import { requireUser } from "@/lib/auth/session";
import { courseLabel } from "@/lib/utils";
import { AnnouncementForm } from "./announcement-form";

export const metadata: Metadata = { title: "Nuevo comunicado" };

export default async function NuevoComunicadoPage() {
  const user = await requireUser();
  const scope = await sendingScope(user);
  if (!scope) redirect("/comunicados");

  return (
    <div>
      <PageHeader title="Nuevo comunicado" back={{ href: "/comunicados", label: "Comunicados" }} />
      <Card>
        <AnnouncementForm
          roles={scope.roles}
          roleLabels={AUDIENCE_LABELS}
          courses={scope.courses.map((c) => ({ id: c.id, label: courseLabel(c) }))}
          canSendSchoolWide={scope.canSendSchoolWide}
        />
      </Card>
    </div>
  );
}
