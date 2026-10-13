import Link from "next/link";
import { db } from "@/lib/db";
import { cn, fullName, initials } from "@/lib/utils";

function when(date: Date) {
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString("es-AR", {
    ...(sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }),
    timeZone: "America/Argentina/Mendoza",
  });
}

export async function ConversationList({ userId, activeId }: { userId: string; activeId?: string }) {
  const conversations = await db.conversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  const unreadRows = await db.$queryRaw<{ conversationId: string; count: bigint }[]>`
    SELECT m."conversationId", count(*) AS count
    FROM "Message" m
    JOIN "ConversationParticipant" p ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
    WHERE m."senderId" IS DISTINCT FROM ${userId}
      AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
    GROUP BY m."conversationId"`;
  const unread = new Map(unreadRows.map((r) => [r.conversationId, Number(r.count)]));

  if (conversations.length === 0) {
    return <p className="p-5 text-sm text-muted">Todavía no tenés conversaciones.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {conversations.map((c) => {
        const other = c.participants.find((p) => p.userId !== userId)?.user;
        const last = c.messages[0];
        const count = unread.get(c.id) ?? 0;
        return (
          <li key={c.id}>
            <Link
              href={`/mensajes/${c.id}`}
              className={cn("flex items-center gap-3 px-4 py-3 hover:bg-surface-muted", c.id === activeId && "bg-primary-soft")}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-muted">
                {other ? initials(other) : "?"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate", count > 0 && "font-semibold")}>{other ? fullName(other) : "Usuario eliminado"}</span>
                  {last && <span className="shrink-0 text-xs text-muted">{when(last.createdAt)}</span>}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-muted">
                    {last?.senderId === userId && "Vos: "}
                    {last?.body}
                  </span>
                  {count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                      {count}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
