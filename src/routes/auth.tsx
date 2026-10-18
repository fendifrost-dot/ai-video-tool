import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { SignInForm } from "@/components/SignInForm";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — AVT" },
      {
        name: "description",
        content: "Sign in to your music-video workspace with Google or a magic link.",
      },
      { property: "og:title", content: "Sign in — AVT" },
      {
        property: "og:description",
        content: "Sign in to your music-video workspace with Google or a magic link.",
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
  const [expiredNote, setExpiredNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setExpiredNote("Session could not be refreshed. Sign in again.");
      }
      const user = data.session?.user;
      setCurrent(
        user
          ? {
              id: user.id,
              email: user.email ?? null,
              anon: Boolean(user.is_anonymous),
            }
          : null,
      );
    };
    read();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") setExpiredNote(null);
      if (event === "SIGNED_OUT") setExpiredNote("Signed out.");
      read();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut({ scope: "local" });
    window.location.replace("/auth");
  }

  const signedIn = current && !current.anon;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="studio-card rounded-2xl border border-border p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-display text-lg font-semibold text-primary-foreground">
            A
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              Sign in to AVT
            </h1>
            <p className="text-sm text-muted-foreground">Private workspace · existing owner account</p>
          </div>
        </div>

        {expiredNote && <p className="mb-3 text-sm text-amber-200">{expiredNote}</p>}

        <div className="mb-5 rounded-xl border border-border bg-background/50 p-3">
          <p className="text-xs text-muted-foreground">Current session</p>
          <p className="mt-1 break-all text-sm text-foreground">
            {current
              ? signedIn
                ? `${current.email ?? "signed in"}`
                : `Guest session — sign in to open your projects`
              : "Not signed in"}
          </p>
        </div>

        {!signedIn && <SignInForm />}

        {signedIn && (
          <Button variant="outline" className="mt-2 w-full" onClick={signOut}>
            Sign out
          </Button>
        )}
      </div>
    </div>
  );
}
