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
      className={cn("relative flex size-9 items-center justify-center rounded-full text-foreground/70 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]", className)}
      aria-label={unread ? `Notificaciones (${unread} sin leer)` : "Notificaciones"}
    >
      <Bell className="size-[20px]" strokeWidth={1.75} aria-hidden />
      {unread > 0 && (
        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-background">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
