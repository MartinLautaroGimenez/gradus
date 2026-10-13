import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { contactsFor } from "@/lib/messaging/contacts";
import { startConversation } from "../actions";
import { Composer } from "../[id]/composer";
import { ContactPicker } from "./contact-picker";

export const metadata: Metadata = { title: "Nuevo mensaje" };

export default async function NuevoMensajePage({ searchParams }: { searchParams: Promise<{ para?: string }> }) {
  const user = await requireUser();
  const { para } = await searchParams;
  const contacts = await contactsFor(user);
  const selected = contacts.find((c) => c.id === para);

  if (selected) {
    // Si ya hay conversación con esa persona, se abre esa.
    const existing = await db.conversation.findFirst({
      where: { AND: [{ participants: { some: { userId: user.id } } }, { participants: { some: { userId: selected.id } } }] },
    });
    if (existing) redirect(`/mensajes/${existing.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Nuevo mensaje" back={{ href: "/mensajes", label: "Mensajes" }} />
      {selected ? (
        <Card className="flex flex-col gap-2 p-0">
          <div className="px-5 pt-4">
            <CardTitle>
              Para: {selected.lastName}, {selected.firstName}
            </CardTitle>
            <CardDescription>{selected.details.join(" · ")}</CardDescription>
          </div>
          <Composer action={startConversation.bind(null, selected.id)} />
        </Card>
      ) : (
        <ContactPicker contacts={contacts} />
      )}
    </div>
  );
}
