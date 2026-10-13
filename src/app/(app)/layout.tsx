import { MobileNav } from "@/components/app-shell/mobile-nav";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { NavLinks } from "@/components/app-shell/nav-links";
import { UserMenu } from "@/components/app-shell/user-menu";
import { Logo } from "@/components/logo";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { unreadMessageCount } from "@/lib/messaging/contacts";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const userMenu = <UserMenu user={user} />;
  const [unread, unreadMessages] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    unreadMessageCount(user.id),
  ]);
  const badges = { "/mensajes": unreadMessages };

  return (
    <div className="md:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 px-3 py-5 md:flex">
        <div className="flex items-center justify-between px-3">
          <Logo />
          <NotificationBell initialUnread={unread} />
        </div>
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <NavLinks roles={user.roles} badges={badges} />
        </div>
        <div className="px-2">{userMenu}</div>
      </aside>
      <MobileNav roles={user.roles} badges={badges} footer={userMenu} bell={<NotificationBell initialUnread={unread} />} />
      <main className="pb-tabbar min-w-0 flex-1 px-4 pt-4 md:px-10 md:pt-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
