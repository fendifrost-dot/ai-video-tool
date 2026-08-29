import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { SignInForm } from "@/components/SignInForm";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — AI Music Video OS" },
      {
        name: "description",
        content: "Sign in to your AI Music Video OS production workspace with a magic link.",
      },
      { property: "og:title", content: "Sign in — AI Music Video OS" },
      {
        property: "og:description",
        content: "Sign in to your AI Music Video OS production workspace with a magic link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [current, setCurrent] = useState<{ id: string; email: string | null; anon: boolean } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setCurrent(
        data.user
          ? {
              id: data.user.id,
              email: data.user.email ?? null,
              anon: Boolean(data.user.is_anonymous),
            }
          : null,
      );
    };
    read();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      read();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.replace("/auth");
  }

  const signedIn = current && !current.anon;

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Email magic link for the owner account. No new accounts are created here.
      </p>

      <div className="glass-float mt-6 rounded-2xl p-5">
        <p className="text-xs text-muted-foreground">Current session</p>
        <p className="mt-1 break-all text-sm">
          {current
            ? signedIn
              ? `${current.email ?? "signed in"} · ${current.id}`
              : `anonymous · ${current.id}`
            : "no session"}
        </p>
      </div>

      {!signedIn && (
        <div className="mt-6">
          <SignInForm />
        </div>
      )}

      {signedIn && (
        <Button variant="outline" className="mt-6" onClick={signOut}>
          Sign out
        </Button>
      )}
    </div>
  );
}
