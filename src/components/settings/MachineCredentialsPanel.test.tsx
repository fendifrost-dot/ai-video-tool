import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MachineCredentialsPanel } from "./MachineCredentialsPanel";
import {
  credentialStatus,
  enrollBatchCredential,
  listBatchCredentials,
  revokeBatchCredential,
  type BatchCredential,
  type BatchProxyInvoke,
} from "@/lib/queries/batchCredentials";

const NOW = new Date("2026-10-02T15:00:00Z");
const cred = (over: Partial<BatchCredential> = {}): BatchCredential => ({
  id: "11111111-1111-4111-8111-111111111111",
  label: "batch runner",
  createdAt: "2026-10-02T14:00:00Z",
  lastUsedAt: null,
  revokedAt: null,
  expiresAt: null,
  ...over,
});

describe("batch-token-proxy client", () => {
  it("list maps rows and never sends an owner", async () => {
    const invoke: BatchProxyInvoke = vi.fn(async () => ({
      data: { ok: true, credentials: [{ id: "a", label: "x", created_at: "2026-10-02T14:00:00Z", revoked_at: null }] },
      error: null,
    }));
    const out = await listBatchCredentials(invoke);
    expect(out).toEqual([{ id: "a", label: "x", createdAt: "2026-10-02T14:00:00Z", lastUsedAt: null, revokedAt: null, expiresAt: null }]);
    expect(invoke).toHaveBeenCalledWith({ action: "list" });
  });

  it("enroll sends only the action and the label, and returns the secret once", async () => {
    const invoke: BatchProxyInvoke = vi.fn(async () => ({
      data: { ok: true, secret: "s3cret", credential: { id: "a", label: "runner", created_at: "2026-10-02T14:00:00Z" } },
      error: null,
    }));
    const out = await enrollBatchCredential({ label: "  runner  " }, invoke);
    expect(invoke).toHaveBeenCalledWith({ action: "enroll", label: "runner" });
    expect(out.secret).toBe("s3cret");
    expect(out.credential.label).toBe("runner");
  });

  it("enroll refuses an empty label before any call", async () => {
    const invoke: BatchProxyInvoke = vi.fn();
    await expect(enrollBatchCredential({ label: "   " }, invoke)).rejects.toThrow(/label/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("revoke uses the proxy's field name and surfaces its error text", async () => {
    const ok: BatchProxyInvoke = vi.fn(async () => ({ data: { ok: true }, error: null }));
    await revokeBatchCredential("abc", ok);
    expect(ok).toHaveBeenCalledWith({ action: "revoke", credentialId: "abc" });
    const bad: BatchProxyInvoke = async () => ({ data: { error: "not_found", detail: "no active credential of yours with that id" }, error: { message: "non-2xx" } });
    await expect(revokeBatchCredential("abc", bad)).rejects.toThrow("not_found: no active credential of yours with that id");
  });

  it("status: revoked beats expired beats active", () => {
    expect(credentialStatus(cred(), NOW)).toBe("active");
    expect(credentialStatus(cred({ expiresAt: "2026-10-01T00:00:00Z" }), NOW)).toBe("expired");
    expect(credentialStatus(cred({ revokedAt: "2026-10-02T14:30:00Z", expiresAt: "2026-10-01T00:00:00Z" }), NOW)).toBe("revoked");
  });
});

describe("MachineCredentialsPanel", () => {
  it("shows the secret once, as the line the runner takes, and it is gone after dismiss", async () => {
    const onCreate = vi.fn(async (label: string) => ({ credential: cred({ label }), secret: "s3cret-value" }));
    render(<MachineCredentialsPanel credentials={[]} onCreate={onCreate} onRevoke={vi.fn()} now={NOW} />);
    expect(screen.queryByTestId("issued-secret")).toBeNull();
    fireEvent.change(screen.getByLabelText("Which machine"), { target: { value: "claude-code runner" } });
    fireEvent.click(screen.getByTestId("create-credential"));
    await waitFor(() => expect(screen.getByTestId("issued-env-line").textContent).toBe("AVT_BATCH_SECRET=s3cret-value"));
    expect(onCreate).toHaveBeenCalledWith("claude-code runner");
    fireEvent.click(screen.getByTestId("dismiss-secret"));
    expect(screen.queryByTestId("issued-secret")).toBeNull();
    expect(document.body.textContent).not.toContain("s3cret-value");
  });

  it("create is disabled without a label", () => {
    render(<MachineCredentialsPanel credentials={[]} onCreate={vi.fn()} onRevoke={vi.fn()} />);
    expect((screen.getByTestId("create-credential") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a revoke takes two deliberate clicks, and dead credentials offer none", async () => {
    const onRevoke = vi.fn(async () => {});
    render(
      <MachineCredentialsPanel
        credentials={[cred(), cred({ id: "22222222-2222-4222-8222-222222222222", label: "old", revokedAt: "2026-10-01T00:00:00Z" })]}
        onCreate={vi.fn()}
        onRevoke={onRevoke}
        now={NOW}
      />,
    );
    expect(screen.getAllByTestId("credential-status").map((e) => e.textContent)).toEqual(["active", "revoked"]);
    expect(screen.getAllByTestId("revoke-credential")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("revoke-credential"));
    expect(onRevoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-revoke"));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111"));
  });

  it("a failed create says why and shows no secret", async () => {
    const onCreate = vi.fn(async () => { throw new Error("unauthorised: sign in again"); });
    render(<MachineCredentialsPanel credentials={[]} onCreate={onCreate} onRevoke={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Which machine"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("create-credential"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("unauthorised: sign in again"));
    expect(screen.queryByTestId("issued-secret")).toBeNull();
  });
});
