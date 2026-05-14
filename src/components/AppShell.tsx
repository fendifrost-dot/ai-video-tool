import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, FolderKanban, Settings, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  to: "/" | "/artists" | "/projects/new" | "/settings";
  match: string;
  exact?: boolean;
};

const nav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, match: "/", exact: true },
  { to: "/artists", label: "Artists", icon: Users, match: "/artists" },
  { to: "/projects/new", label: "Projects", icon: FolderKanban, match: "/projects" },
  { to: "/settings", label: "Settings", icon: Settings, match: "/settings" },
];

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <span className="text-sm font-semibold tracking-tight">AI Music Video OS</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {nav.map((item) => {
            const active = item.exact ? pathname === item.match : pathname.startsWith(item.match);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="border-b border-border px-8 py-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </header>
  );
}

export function ComingSoon() {
  return <div className="px-8 py-12 text-sm text-muted-foreground">Coming soon.</div>;
}
