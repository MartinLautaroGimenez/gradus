import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { managedCourses } from "@/lib/scope";
import { courseLabel } from "@/lib/utils";
import { AuthorizationForm } from "./authorization-form";

export const metadata: Metadata = { title: "Nueva autorización" };

export default async function NuevaAutorizacionPage() {
  const user = await requireUser();
  const courses = await managedCourses(user);
  if (courses.length === 0) redirect("/autorizaciones");
  return (
    <div>
      <PageHeader title="Nueva autorización" back={{ href: "/autorizaciones", label: "Autorizaciones" }} />
      <Card>
        <AuthorizationForm courses={courses.map((c) => ({ id: c.id, label: courseLabel(c) }))} />
      </Card>
    </div>
  );
}
