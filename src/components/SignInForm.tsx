import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Magic-link sign-in for the existing durable owner account.
 * Never creates new users (shouldCreateUser: false) and signs out any
 * anonymous session first so the link binds to the durable account.
 */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

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
    <div>
      <form onSubmit={sendLink} className="space-y-3">
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" className="w-full" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send magic link"}
        </Button>
      </form>
      {message && (
        <p
          className={
            status === "error" ? "mt-4 text-sm text-destructive" : "mt-4 text-sm text-muted-foreground"
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
