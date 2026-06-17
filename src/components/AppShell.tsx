import { useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Sparkles,
  MoreHorizontal,
  Settings,
  LogOut,
  MapPin,
  Lightbulb,
  Package,
  Layers,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isProductCatalogEnabled } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// AppShell — top-level layout (sidebar on desktop, top bar + bottom tabs on
// mobile). The primary nav surfaces 5 items: Dashboard, Artists, Projects,
// Looks, More. "More" opens a shadcn Sheet drawer with the secondary nav
// (Locations, Props, Settings) so the bottom bar stays mobile-friendly.
// ---------------------------------------------------------------------------

type PrimaryRouteTo =
  | "/projects"
  | "/artists"
  | "/looks";

type PrimaryNavItem = {
  kind: "link";
  label: string;
  icon: typeof LayoutDashboard;
  to: PrimaryRouteTo;
  match: string;
  exact?: boolean;
};

type MoreNavTrigger = {
  kind: "more";
  label: string;
  icon: typeof LayoutDashboard;
};

type NavItem = PrimaryNavItem | MoreNavTrigger;

const primaryNav: PrimaryNavItem[] = [
  { kind: "link", to: "/projects", label: "Projects", icon: FolderKanban, match: "/projects", exact: false },
  { kind: "link", to: "/artists", label: "Artists", icon: Users, match: "/artists" },
  { kind: "link", to: "/looks", label: "Virtual Samples", icon: Sparkles, match: "/looks" },
];

const moreTrigger: MoreNavTrigger = {
  kind: "more",
  label: "More",
  icon: MoreHorizontal,
};

type SecondaryNavItem = {
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
  to: "/library/locations" | "/settings" | "/design-studio" | "/products" | "/collections";
};

const catalogNav: SecondaryNavItem[] = [
  {
    to: "/design-studio",
    label: "Design Studio",
    description: "Develop garment concepts before they enter the library.",
    icon: Lightbulb,
  },
  {
    to: "/products",
    label: "Products",
    description: "Approved SKUs — MOD-001, MOD-002, and the rest of your line.",
    icon: Package,
  },
  {
    to: "/collections",
    label: "Collections",
    description: "Seasonal drops and campaign groupings for your line.",
    icon: Layers,
  },
];

const secondaryNav: SecondaryNavItem[] = [
  ...(isProductCatalogEnabled() ? catalogNav : []),
  {
    to: "/library/locations",
    label: "Library",
    description: "Reusable locations and props for your shoots.",
    icon: MapPin,
  },
  {
    to: "/settings",
    label: "Settings",
    description: "App preferences and account.",
    icon: Settings,
  },
];

function isMoreActive(pathname: string): boolean {
  return (
    pathname.startsWith("/library") ||
    pathname.startsWith("/design-studio") ||
    pathname.startsWith("/products") ||
    pathname.startsWith("/collections") ||
    secondaryNav.some((s) => pathname.startsWith(s.to))
  );
}

function isPrimaryActive(item: PrimaryNavItem, pathname: string): boolean {
  return item.exact ? pathname === item.match : pathname.startsWith(item.match);
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);

  const navItems: NavItem[] = [...primaryNav, moreTrigger];

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
            {navItems.map((item) => {
              const Icon = item.icon;
              if (item.kind === "more") {
                const active = isMoreActive(pathname);
                return (
                  <button
                    key="more"
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    className={cn(
                      "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all",
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
                  </button>
                );
              }
              const active = isPrimaryActive(item, pathname);
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
          {navItems.map((item) => {
            const Icon = item.icon;
            if (item.kind === "more") {
              const active = isMoreActive(pathname);
              return (
                <button
                  key="more"
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className={cn(
                    "relative flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition-all",
                    active ? "text-foreground" : "text-foreground/55",
                  )}
                  aria-label="More options"
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
                </button>
              );
            }
            const active = isPrimaryActive(item, pathname);
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

      {/* More drawer — collapses the secondary nav for both mobile + desktop */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription>
              Library, settings, and other less-used sections.
            </SheetDescription>
          </SheetHeader>
          <nav className="mt-6 space-y-1">
            {secondaryNav.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border border-transparent px-3 py-3 text-sm transition-colors",
                    active
                      ? "border-border bg-muted/40 text-foreground"
                      : "text-foreground/80 hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active && "text-primary")} />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  variant = "default",
}: {
  title: string;
  subtitle?: string;
  variant?: "default" | "compact";
}) {
  if (variant === "compact") {
    return (
      <header className="border-b border-border px-4 py-2 md:px-8">
        <div className="flex min-h-10 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="font-display text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-foreground/60">{subtitle}</p>
          )}
        </div>
      </header>
    );
  }

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

export function SoonPlaceholder({
  message,
  backTo,
  backLabel = "Back to Shots",
}: {
  message: string;
  backTo?: { to: string; params?: Record<string, string> };
  backLabel?: string;
}) {
  return (
    <div className="px-4 py-12 md:px-8">
      <div className="glass rounded-2xl px-6 py-10 text-center">
        <span className="mb-3 inline-block rounded-full bg-muted px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Coming soon
        </span>
        <p className="text-sm text-foreground/60">{message}</p>
        {backTo && (
          <div className="mt-4">
            <Link
              to={backTo.to as never}
              params={backTo.params as never}
              className="text-sm font-medium text-primary hover:underline"
            >
              {backLabel}
            </Link>
          </div>
        )}
      </div>
    </div>
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
