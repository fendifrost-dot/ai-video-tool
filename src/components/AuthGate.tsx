import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Single-user auth gate.
 *
 * The app used to silently `signInAnonymously()` on every load. That mints a
 * NEW anonymous user per browser/device, so data gets welded to whichever
 * anonymous id first created it and is invisible everywhere else. For a
 * single-user internal tool that is structurally wrong.
 *
 * This gate replaces that with one stable identity:
 *   - permanent session            -> app
 *   - anonymous session (legacy)   -> "Secure this workspace": set email +
 *                                     password via updateUser(), which keeps
 *                                     the SAME user id, so all existing data
 *                                     and files stay put (no migration).
 *   - no session                   -> sign in with email + password.
 *
 * No automatic anonymous sign-in anywhere. Single account, stable across
 * every browser and device.
 */
type AuthState = "loading" | "no_session" | "anonymous" | "ready";

export function AuthGate() {
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    let cancelled = false;
    function resolve(session: unknown) {
      if (cancelled) return;
      const s = session as { user?: { is_anonymous?: boolean } } | null;
      if (!s) {
        setState("no_session");
        return;
      }
      setState(s.user?.is_anonymous ? "anonymous" : "ready");
    }
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      resolve(session),
    );
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state === "ready") return <AppShell />;
  if (state === "anonymous") return <ClaimWorkspaceScreen />;
  return <LoginScreen />;
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Anonymous (legacy) session: attach email+password, keeping the same user id. */
function ClaimWorkspaceScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    if (!email || password.length < 8) {
      toast.error("Enter an email and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ email, password });
      if (error) throw error;
      toast.success(
        "Workspace secured. If asked, confirm via the email link, then sign in with these credentials on any device.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not secure workspace");
    } finally {
      setBusy(false);
    }
  }

  async function signOutToLogin() {
    await supabase.auth.signOut();
  }

  return (
    <Shell
      title="Secure your workspace"
      subtitle="You're in a temporary session. Set a permanent login — this keeps all of your existing artists, Character DNA, and files (same account, nothing is moved)."
    >
      <form onSubmit={claim} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="claim-email">Email</Label>
          <Input id="claim-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="claim-password">Password</Label>
          <Input id="claim-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Securing…" : "Secure this workspace"}
        </Button>
      </form>
      <button type="button" onClick={signOutToLogin} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
        This isn't my data — sign in to my workspace instead
      </button>
    </Shell>
  );
}

/** No session: sign in with the single account's email + password. */
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Sign in" subtitle="Sign in to your workspace.">
      <form onSubmit={signIn} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Shell>
  );
}
