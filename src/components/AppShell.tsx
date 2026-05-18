import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, FolderKanban, Settings, LogOut, MapPin, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  to: "/" | "/artists" | "/projects/new" | "/settings" | "/library/locations" | "/library/props";
  match: string;
  exact?: boolean;
};

const nav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, match: "/", exact: true },
  { to: "/artists", label: "Artists", icon: Users, match: "/artists" },
  { to: "/projects/new", label: "Projects", icon: FolderKanban, match: "/projects" },
  { to: "/library/locations", label: "Locations", icon: MapPin, match: "/library/locations" },
  { to: "/library/props", label: "Props", icon: Package, match: "/library/props" },
  { to: "/settings", label: "Settings", icon: Settings, match: "/settings" },
];

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="relative flex min-h-[100dvh] text-foreground">
      {/* Aurora orbs (decorative depth) */}
      <div
        aria-hidden
        className="pointer-events-none fixed -top-32 -left-20 h-[420px] w-[420px] rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--aurora-1), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed top-1/3 -right-32 h-[520px] w-[520px] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--aurora-2), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-40 left-1/3 h-[460px] w-[460px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--aurora-3), transparent 70%)" }}
      />

      {/* Desktop sidebar — floating glass slab */}
      <aside className="relative z-10 hidden md:flex md:w-64 md:shrink-0 md:flex-col md:p-4">
        <div className="glass-float sticky top-4 flex h-[calc(100dvh-2rem)] flex-col rounded-2xl">
          <div className="flex h-16 items-center gap-2 px-5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg ring-glow"
              style={{
                background:
                  "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))",
              }}
            >
              <span className="font-display text-sm font-bold text-background">A</span>
            </div>
            <span className="font-display text-sm font-semibold tracking-tight text-gradient-aurora">
              AI Music Video OS
            </span>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.match : pathname.startsWith(item.match);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    active
                      ? "glass-raised text-foreground"
                      : "text-foreground/60 hover:text-foreground hover:bg-white/5",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-transform",
                      active && "text-primary",
                      "group-hover:scale-110",
                    )}
                  />
                  {item.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute right-2 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/5 p-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 rounded-xl text-foreground/60 hover:bg-white/5 hover:text-foreground"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 md:hidden">
        <div className="glass-float mx-3 mt-3 flex h-14 items-center gap-2 rounded-2xl px-4">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg ring-glow"
            style={{
              background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))",
            }}
          >
            <span className="font-display text-sm font-bold text-background">A</span>
          </div>
          <span className="font-display text-sm font-semibold tracking-tight text-gradient-aurora">
            AI Music Video OS
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-9 w-9 rounded-xl text-foreground/70 hover:bg-white/5 hover:text-foreground"
            onClick={() => supabase.auth.signOut()}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 overflow-x-hidden pt-20 pb-28 md:pt-0 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 md:hidden">
        <div
          className="glass-float mx-3 mb-3 flex items-center justify-around rounded-2xl px-2 py-2"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          {nav.map((item) => {
            const active = item.exact ? pathname === item.match : pathname.startsWith(item.match);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition-all",
                  active ? "text-foreground" : "text-foreground/55",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                    active && "glass-raised ring-glow -translate-y-1",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-primary")} />
                </span>
                <span className="tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="px-4 pt-4 pb-6 md:px-8 md:pt-8">
      <div className="glass-float rounded-2xl px-5 py-5 md:px-7 md:py-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl text-gradient-aurora">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-foreground/60 md:text-base">{subtitle}</p>
        )}
      </div>
    </header>
  );
}

export function ComingSoon() {
  return (
    <div className="px-4 py-12 md:px-8">
      <div className="glass rounded-2xl px-6 py-10 text-center text-sm text-foreground/60">
        Coming soon.
      </div>
    </div>
  );
}
