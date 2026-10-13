import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ConversationList } from "@/components/messaging/conversation-list";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { contactsFor } from "@/lib/messaging/contacts";
import { cn, fullName } from "@/lib/utils";
import { sendMessage } from "../actions";
import { Composer } from "./composer";
import { ScrollToEnd } from "./scroll-to-end";

export const metadata: Metadata = { title: "Mensajes" };

function dayLabel(date: Date) {
  return date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Mendoza" });
}

export default async function ConversacionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: {
      participants: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      messages: { orderBy: { createdAt: "asc" }, take: 500 },
    },
  });
  const me = conversation?.participants.find((p) => p.userId === user.id);
  if (!conversation || !me) notFound();

  // Abrir la conversación la marca como leída (y su aviso en la bandeja).
  await db.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    data: { lastReadAt: new Date() },
  });
  await db.notification.updateMany({ where: { userId: user.id, link: `/mensajes/${id}`, readAt: null }, data: { readAt: new Date() } });

  const other = conversation.participants.find((p) => p.userId !== user.id);
  const contact = other ? (await contactsFor(user)).find((c) => c.id === other.userId) : undefined;
  const otherRead = other?.lastReadAt;

  let lastDay = "";
  return (
    <div className="grid h-[calc(100dvh-7rem)] overflow-hidden rounded-2xl bg-surface shadow-card md:h-[calc(100dvh-4rem)] grid-cols-1 lg:grid-cols-[22rem_1fr]">
      <div className="hidden overflow-y-auto border-r border-border lg:block">
        <ConversationList userId={user.id} activeId={id} />
      </div>
      <section className="flex min-h-0 min-w-0 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Link href="/mensajes" className="rounded-lg p-1 text-muted hover:bg-surface-muted lg:hidden" aria-label="Volver">
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{other ? fullName(other.user) : "Conversación"}</h1>
            {contact && <p className="truncate text-xs text-muted">{contact.details.join(" · ")}</p>}
          </div>
        </header>
        <ol className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-4" aria-label="Mensajes">
          {conversation.messages.map((message) => {
            const mine = message.senderId === user.id;
            const day = dayLabel(message.createdAt);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <li key={message.id} className="flex flex-col">
                {showDay && (
                  <span className="my-2 self-center rounded-full bg-surface-muted px-3 py-0.5 text-xs text-muted first-letter:uppercase">{day}</span>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line sm:max-w-[70%]",
                    mine ? "self-end rounded-br-md bg-primary text-primary-foreground" : "self-start rounded-bl-md bg-surface-muted",
                  )}
                >
                  {message.body}
                  <span className={cn("mt-0.5 block text-right text-[10px]", mine ? "text-primary-foreground/80" : "text-muted")}>
                    {message.createdAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Mendoza" })}
                    {mine && otherRead && otherRead >= message.createdAt && " · Leído"}
                  </span>
                </div>
              </li>
            );
          })}
          {/* Ancla para que la vista arranque abajo, en el último mensaje. */}
          <li id="fin" className="h-px" aria-hidden />
        </ol>
        <Composer action={sendMessage.bind(null, id)} />
      </section>
      <AutoRefresh intervalMs={10_000} />
      <ScrollToEnd count={conversation.messages.length} />
    </div>
  );
}
