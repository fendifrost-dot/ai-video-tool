/**
 * Machine credentials — the signed-in owner's handle on `batch-token-proxy`.
 *
 * Why this exists (2026-10-02): unattended runners (scripts/_lib/auth.py) exchange a long-lived, revocable batch
 * credential for an ordinary user session. Creating one needs a real user JWT, and until now the only way to supply
 * that was to hand-copy a token out of the browser into a file on the runner — which no agent session can (or should)
 * do for the owner. This puts the three owner actions where the owner already is: signed in to the app.
 *
 * The secret is returned by `enroll` ONCE and is never stored by the server (only its sha256). Nothing here stores it
 * either: the mutation hands it to the caller, the panel holds it in component state until dismissed.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type BatchCredential = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
};

export type EnrolledCredential = { credential: BatchCredential; secret: string };

type Row = {
  id: string;
  label: string;
  created_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  expires_at?: string | null;
};

function fromRow(r: Row): BatchCredential {
  return {
    id: r.id,
    label: r.label,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at ?? null,
    revokedAt: r.revoked_at ?? null,
    expiresAt: r.expires_at ?? null,
  };
}

/** One call to the proxy. The body never names an owner: the function takes it from the caller's JWT. */
export type BatchProxyInvoke = (body: Record<string, unknown>) => Promise<{
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
}>;

const invokeProxy: BatchProxyInvoke = async (body) => {
  const { data, error } = await supabase.functions.invoke<Record<string, unknown>>(
    "batch-token-proxy",
    { body },
  );
  return { data: data ?? null, error: error ? { message: error.message } : null };
};

function fail(data: Record<string, unknown> | null, error: { message?: string } | null): never {
  const code = typeof data?.error === "string" ? data.error : null;
  const detail = typeof data?.detail === "string" ? data.detail : null;
  throw new Error([code, detail].filter(Boolean).join(": ") || error?.message || "batch-token-proxy failed");
}

export async function listBatchCredentials(invoke: BatchProxyInvoke = invokeProxy): Promise<BatchCredential[]> {
  const { data, error } = await invoke({ action: "list" });
  if (error || !data || data.ok !== true) fail(data, error);
  return ((data.credentials as Row[] | undefined) ?? []).map(fromRow);
}

export async function enrollBatchCredential(
  input: { label: string; expiresInDays?: number },
  invoke: BatchProxyInvoke = invokeProxy,
): Promise<EnrolledCredential> {
  const label = input.label.trim();
  if (!label || label.length > 80) throw new Error("A label of 1–80 characters says which machine this is for.");
  const body: Record<string, unknown> = { action: "enroll", label };
  if (input.expiresInDays != null) body.expiresInDays = input.expiresInDays;
  const { data, error } = await invoke(body);
  if (error || !data || data.ok !== true || typeof data.secret !== "string") fail(data, error);
  return { credential: fromRow(data.credential as Row), secret: data.secret as string };
}

export async function revokeBatchCredential(
  credentialId: string,
  invoke: BatchProxyInvoke = invokeProxy,
): Promise<void> {
  const { data, error } = await invoke({ action: "revoke", credentialId });
  if (error || !data || data.ok !== true) fail(data, error);
}

/** active → usable; revoked / expired → dead. */
export function credentialStatus(c: BatchCredential, now: Date = new Date()): "active" | "revoked" | "expired" {
  if (c.revokedAt) return "revoked";
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

export const batchCredentialsKeys = { all: ["batch-credentials"] as const };

export function useBatchCredentials(enabled = true) {
  return useQuery<BatchCredential[]>({
    queryKey: batchCredentialsKeys.all,
    queryFn: () => listBatchCredentials(),
    enabled,
    staleTime: 15_000,
  });
}

export function useEnrollBatchCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { label: string; expiresInDays?: number }) => enrollBatchCredential(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: batchCredentialsKeys.all }),
  });
}

export function useRevokeBatchCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (credentialId: string) => revokeBatchCredential(credentialId),
    onSuccess: () => qc.invalidateQueries({ queryKey: batchCredentialsKeys.all }),
  });
}
