import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AI Music Video OS" },
      { name: "description", content: "Production OS for AI-driven music videos." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Single-user app: ensure an anonymous Supabase session exists so RLS policies
 * (which rely on auth.uid()) work without any sign-in UI. The session is
 * persisted to localStorage by the supabase-js client, so the same anon user
 * sticks around across reloads on this device.
 *
 * If anon sign-in is disabled on the Supabase project, this surfaces a clear
 * console error and shows a "no session" state. Re-enable anonymous sign-ins
 * in the Supabase Auth settings (Lovable Cloud -> Users -> Auth settings).
 */
function useBootstrapSession() {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (!cancelled) setState("ready");
          return;
        }
        const { error } = await supabase.auth.signInAnonymously();
        if (cancelled) return;
        if (error) {
          console.error("[bootstrap] anonymous sign-in failed:", error.message);
          setState("failed");
          return;
        }
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("[bootstrap] session init threw:", err);
        setState("failed");
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const status = useBootstrapSession();

  return (
    <QueryClientProvider client={queryClient}>
      {status === "loading" ? (
        <div className="min-h-screen bg-background" />
      ) : status === "failed" ? (
        <BootstrapErrorScreen />
      ) : (
        <AppShell />
      )}
      <Toaster />
    </QueryClientProvider>
  );
}

function BootstrapErrorScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Couldn't start a session</h1>
        <p className="text-sm text-muted-foreground">
          Anonymous sign-in failed. Enable anonymous sign-ins in Lovable Cloud → Users → Auth
          settings, then reload.
        </p>
      </div>
    </div>
  );
}

// Keep Outlet referenced for tree-shaking awareness in dev tools.
export { Outlet };
