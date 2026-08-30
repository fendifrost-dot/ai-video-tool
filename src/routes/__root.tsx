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
import { SignInForm } from "@/components/SignInForm";
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
      { property: "og:title", content: "AI Music Video OS" },
      { name: "twitter:title", content: "AI Music Video OS" },
      { property: "og:description", content: "Production OS for AI-driven music videos." },
      { name: "twitter:description", content: "Production OS for AI-driven music videos." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dec95cc5-ac28-41bf-8464-bd623e78facd/id-preview-c6eba3bc--bd21b544-c7b8-4780-bdde-391ac9d4bfa8.lovable.app-1778895460941.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dec95cc5-ac28-41bf-8464-bd623e78facd/id-preview-c6eba3bc--bd21b544-c7b8-4780-bdde-391ac9d4bfa8.lovable.app-1778895460941.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
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
 * Sign-in gate: the site requires a real (non-anonymous) session. Anonymous
 * bootstrap is kept ONLY as a transient bridge while no session exists yet —
 * but the UI stays behind the sign-in screen until a durable account signs in.
 */
function hasPendingAuthRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const href = window.location.href;
  return (
    href.includes("access_token=") ||
    href.includes("token_hash=") ||
    href.includes("type=magiclink") ||
    href.includes("type=email") ||
    /[?&]code=/.test(href)
  );
}

function useSessionState() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "signed-out" }
    | { status: "signed-in"; anon: boolean }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        if (data.user && !data.user.is_anonymous) {
          setState({ status: "signed-in", anon: false });
          return;
        }
        if (data.user?.is_anonymous) {
          setState({ status: "signed-in", anon: true });
          return;
        }
        // Magic-link hash/code is still being exchanged. Do not create an
        // anonymous user that could race and overwrite the durable session.
        if (hasPendingAuthRedirect()) {
          setState({ status: "signed-out" });
          return;
        }
        // No session: create an anonymous one so the app shell works after
        // sign-in (magic link needs a clean slate, SignInForm signs it out).
        await supabase.auth.signInAnonymously();
        if (cancelled) return;
        setState({ status: "signed-out" });
      } catch (err) {
        if (cancelled) return;
        console.error("[bootstrap] session init threw:", err);
        setState({ status: "signed-out" });
      }
    }

    bootstrap();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user && !session.user.is_anonymous) {
        setState({ status: "signed-in", anon: false });
      } else {
        setState({ status: "signed-out" });
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const session = useSessionState();
  const router = useRouter();

  // When the session identity changes (anonymous -> durable magic-link account),
  // drop cached rows fetched under the old auth.uid() and refetch.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        queryClient.clear();
        router.invalidate();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  // Gate the entire site behind a durable (non-anonymous) sign-in.
  const needsSignIn = session.status === "signed-out" || (session.status === "signed-in" && session.anon);

  return (
    <QueryClientProvider client={queryClient}>
      {session.status === "loading" ? (
        <div className="min-h-screen bg-background" />
      ) : needsSignIn ? (
        <SignInGate />
      ) : (
        <AppShell />
      )}
      <Toaster />
    </QueryClientProvider>
  );
}

function SignInGate() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="glass-float w-full max-w-sm rounded-2xl p-6">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg ring-glow"
          style={{ background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))" }}
        >
          <span className="font-display text-base font-bold text-background">A</span>
        </div>
        <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">
          Sign in to AI Music Video OS
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This workspace is private. Use the owner email to receive a magic link.
        </p>
        <div className="mt-5">
          <SignInForm />
        </div>
      </div>
    </div>
  );
}

// Keep Outlet referenced for tree-shaking awareness in dev tools.
export { Outlet };
