import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Google first for the existing durable owner account; magic link is an optional fallback.
 * shouldCreateUser: false so we never mint an empty parallel account.
 */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error" | "oauth">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [showMagic, setShowMagic] = useState(false);

  async function continueWithGoogle() {
    setStatus("oauth");
    setMessage(null);
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user?.is_anonymous) await supabase.auth.signOut();

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
        extraParams: { prompt: "select_account" },
      });
      if (result.error) throw new Error(result.error.message);
      if (result.redirected) return;
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      const text = err instanceof Error ? err.message : "Google sign-in failed.";
      setMessage(
        /provider is not enabled|unsupported provider|validation_failed/i.test(text)
          ? "Google sign-in is not enabled on this project yet. Use the magic-link fallback, or finish Google provider setup in Lovable Cloud (owner-only)."
          : text,
      );
    }
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;
    setStatus("sending");
    setMessage(null);
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user?.is_anonymous) await supabase.auth.signOut();

      const { error } = await supabase.auth.signInWithOtp({
        email: target,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          shouldCreateUser: false,
        },
      });
      if (error) throw error;
      setStatus("sent");
      setMessage(`Magic link sent to ${target}. Open it on this device to finish signing in.`);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not send the magic link.");
    }
  }

  return (
    <div className="space-y-4" data-testid="sign-in-form">
      <Button
        type="button"
        className="w-full"
        onClick={() => void continueWithGoogle()}
        disabled={status === "oauth"}
        data-testid="google-sign-in"
      >
        {status === "oauth" ? "Opening Google…" : "Continue with Google"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Uses your existing Gmail. Stays signed in on this device while the browser allows it.
      </p>

      <Button
        type="button"
        variant="link"
        className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setShowMagic((v) => !v)}
      >
        {showMagic ? "Hide magic link" : "Use email magic link instead"}
      </Button>

      {showMagic && (
        <form onSubmit={sendLink} className="space-y-3">
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" variant="secondary" className="w-full" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : "Send magic link"}
          </Button>
        </form>
      )}

      {message && (
        <p
          className={
            status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
