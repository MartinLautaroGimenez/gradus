import { MobileNav } from "@/components/app-shell/mobile-nav";
import { NavLinks } from "@/components/app-shell/nav-links";
import { UserMenu } from "@/components/app-shell/user-menu";
import { Logo } from "@/components/logo";
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const userMenu = <UserMenu user={user} />;

  return (
    <div className="md:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 md:flex">
        <Logo className="px-2 text-lg" />
        <div className="flex-1 overflow-y-auto">
          <NavLinks roles={user.roles} />
        </div>
        {userMenu}
      </aside>
      <MobileNav roles={user.roles} footer={userMenu} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
