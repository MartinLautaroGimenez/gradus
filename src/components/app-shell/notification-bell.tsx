"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const POLL_MS = 60_000;

export function NotificationBell({ initialUnread, className }: { initialUnread: number; className?: string }) {
  const [unread, setUnread] = useState(initialUnread);
  const pathname = usePathname();

  useEffect(() => setUnread(initialUnread), [initialUnread, pathname]);

  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/notificaciones").catch(() => null);
      if (res?.ok) setUnread((await res.json()).unread);
    };
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <Link
      href="/notificaciones"
      className={cn("relative rounded-lg p-2 text-muted hover:bg-surface-muted hover:text-foreground", className)}
      aria-label={unread ? `Notificaciones (${unread} sin leer)` : "Notificaciones"}
    >
      <Bell className="size-5" aria-hidden />
      {unread > 0 && (
        <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
