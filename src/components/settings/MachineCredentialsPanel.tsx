import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { credentialStatus, type BatchCredential, type EnrolledCredential } from "@/lib/queries/batchCredentials";

/**
 * Machine credentials (Settings). The owner creates a credential for one runner, sees its secret ONCE, hands it to that
 * runner as AVT_BATCH_SECRET, and can revoke any credential here. Presentational: every effect arrives as a prop, so
 * the behaviours worth holding are testable without a network — the secret is shown once and gone on dismiss, and a
 * revoke takes two deliberate clicks.
 */
export type MachineCredentialsPanelProps = {
  credentials: BatchCredential[];
  loading?: boolean;
  error?: string | null;
  busy?: boolean;
  onCreate: (label: string) => Promise<EnrolledCredential>;
  onRevoke: (credentialId: string) => Promise<void>;
  now?: Date;
  /** The AVT MCP server's URL: when given, the issued secret is also shown as a ready MCP URL for AI apps. */
  mcpUrl?: string;
};

function day(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "never";
}

export function MachineCredentialsPanel({
  credentials,
  loading = false,
  error = null,
  busy = false,
  onCreate,
  onRevoke,
  now,
  mcpUrl,
}: MachineCredentialsPanelProps) {
  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<EnrolledCredential | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function create() {
    setFailure(null);
    try {
      const out = await onCreate(label.trim());
      setIssued(out);
      setCopied(false);
      setLabel("");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function revoke(id: string) {
    setFailure(null);
    try {
      await onRevoke(id);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(null);
    }
  }

  const envLine = issued ? `AVT_BATCH_SECRET=${issued.secret}` : "";

  return (
    <section className="glass rounded-2xl px-6 py-6" data-testid="machine-credentials">
      <h2 className="font-display text-lg font-semibold tracking-tight">Machine credentials</h2>
      <p className="mt-1 text-sm text-foreground/60">
        A credential lets one unattended runner (a batch script, an agent session) act as you without a browser token.
        Create one per machine, hand its secret to that machine as <code>AVT_BATCH_SECRET</code>, and revoke it here
        when the machine is done.
      </p>

      {issued && (
        <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4" data-testid="issued-secret">
          <p className="text-sm font-medium">
            Secret for “{issued.credential.label}” — shown once. It cannot be read back later; if it is lost, revoke
            this credential and create another.
          </p>
          <code className="mt-2 block break-all rounded-md bg-background/60 px-3 py-2 text-xs" data-testid="issued-env-line">
            {envLine}
          </code>
          {mcpUrl && (
            <>
              <p className="mt-3 text-xs text-foreground/60">For an AI app (Claude, ChatGPT, Grok) — the MCP URL with this secret in it:</p>
              <code className="mt-1 block break-all rounded-md bg-background/60 px-3 py-2 text-xs" data-testid="issued-mcp-url">
                {`${mcpUrl}/${issued.secret}`}
              </code>
            </>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => copy(envLine)} data-testid="copy-secret">
              {copied ? "Copied" : "Copy"}
            </Button>
            {mcpUrl && (
              <Button size="sm" variant="outline" onClick={() => copy(`${mcpUrl}/${issued.secret}`)} data-testid="copy-mcp-url">
                Copy MCP URL
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setIssued(null)} data-testid="dismiss-secret">
              I have stored it
            </Button>
          </div>
        </div>
      )}

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="min-w-56 flex-1">
          <label htmlFor="machine-label" className="text-xs uppercase tracking-wider text-muted-foreground">
            Which machine
          </label>
          <Input
            id="machine-label"
            value={label}
            maxLength={80}
            placeholder="e.g. claude-code batch runner"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy || !label.trim()} data-testid="create-credential">
          Create credential
        </Button>
      </form>

      {(failure || error) && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {failure || error}
        </p>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-foreground/60">No credentials yet.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="credential-list">
            {credentials.map((c) => {
              const status = credentialStatus(c, now);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3" data-testid="credential-row">
                  <div className="min-w-48 flex-1">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-foreground/60">
                      created {day(c.createdAt)} · last used {day(c.lastUsedAt)}
                      {c.expiresAt ? ` · expires ${day(c.expiresAt)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      status === "active" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                    data-testid="credential-status"
                  >
                    {status}
                  </span>
                  {status === "active" &&
                    (confirming === c.id ? (
                      <span className="flex items-center gap-2">
                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => revoke(c.id)} data-testid="confirm-revoke">
                          Revoke now
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setConfirming(c.id)} data-testid="revoke-credential">
                        Revoke
                      </Button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
