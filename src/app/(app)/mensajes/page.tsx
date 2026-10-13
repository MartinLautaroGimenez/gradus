import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ConversationList } from "@/components/messaging/conversation-list";
import { PageHeader } from "@/components/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Mensajes" };

export default async function MensajesPage() {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Mensajes" actions={<LinkButton href="/mensajes/nuevo">Nuevo mensaje</LinkButton>} />
      <div className="grid overflow-hidden rounded-xl border border-border bg-surface lg:grid-cols-[22rem_1fr]">
        <div className="lg:border-r lg:border-border">
          <ConversationList userId={user.id} />
        </div>
        <div className="hidden min-h-96 flex-col items-center justify-center gap-2 text-sm text-muted lg:flex">
          <MessageCircle className="size-8" aria-hidden />
          Elegí una conversación o empezá una nueva.
        </div>
      </div>
      <AutoRefresh intervalMs={30_000} />
    </div>
  );
}
