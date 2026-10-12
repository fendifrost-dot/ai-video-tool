import { describe, expect, it, vi } from "vitest";
import { callerMayRead, callerMayWrite, signForCaller, wellFormedObjectPath } from "./storageAccess.ts";

const me = "3ca10935-8c3d-4479-9a0c-8bfe8050840c", other = "832fa0bc-1f7e-4586-ab8b-2ac323698ede", project = "764a63d2-93cd-44f3-905f-292f14ab2f51";
function admin(grants: Array<[string, string, string, string]> = [], signError: string | null = null) {
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const q = { select: () => q, eq(k: string, v: unknown) { filters[k] = v; return q; }, limit: async () => ({ data: grants.filter(([b, f, p, u]) => b === filters.bucket_id && f === filters.folder_uid && p === filters.project_id && u === filters.user_id).map(() => ({ user_id: me })), error: table === "storage_legacy_folder_grants" ? null : { message: "wrong table" } }) };
    return q;
  });
  const createSignedUrl = vi.fn(async (path: string) => signError ? { data: null, error: { message: signError } } : { data: { signedUrl: `https://x/sign/${path}?token=secret` }, error: null });
  return { from, storage: { from: () => ({ createSignedUrl }) }, createSignedUrl };
}

describe("unit: caller-scoped storage access", () => {
  it("accepts well-formed owner paths and rejects traversal, absolute and non-uuid folders", () => {
    expect(wellFormedObjectPath(`${me}/a.png`)).toBe(true);
    for (const bad of ["", "/x", `${me}`, `${me}//a`, `${me}/../b`, `${me}/./b`, "notauuid/a.png", `${me}\\a`, 42, null]) expect(wellFormedObjectPath(bad), String(bad)).toBe(false);
  });
  it("owner folder is allowed without a lookup; another user's folder is refused", async () => {
    const a = admin();
    expect(await callerMayRead(a, me, "project-references", `${me}/${project}/x.png`)).toEqual({ ok: true, via: "owner" });
    expect(await callerMayRead(a, me, "project-references", `${other}/${project}/x.png`)).toEqual({ ok: false, reason: "not_owner" });
    expect(a.from).toHaveBeenCalledTimes(1);
  });
  it("a legacy grant allows exactly its bucket + folder + project", async () => {
    const a = admin([["project-references", other, project, me]]);
    expect(await callerMayRead(a, me, "project-references", `${other}/${project}/hero.jpg`)).toEqual({ ok: true, via: "legacy_grant" });
    expect(await callerMayRead(a, me, "prop-refs", `${other}/${project}/hero.jpg`)).toMatchObject({ ok: false });
    expect(await callerMayRead(a, me, "project-references", `${other}/e05c6d55-a819-47d4-8fb2-0e54e0905629/hero.jpg`)).toMatchObject({ ok: false });
    expect(await callerMayRead(a, me, "project-references", `${other}/notaproject/hero.jpg`)).toEqual({ ok: false, reason: "not_owner" });
  });
  it("writes are allowed only inside the caller's folder", () => {
    expect(callerMayWrite(me, `${me}/${project}/derivatives/a.jpg`)).toBe(true);
    expect(callerMayWrite(me, `${other}/${project}/a.jpg`)).toBe(false);
  });
  it("signForCaller refuses before touching storage and maps outcomes to statuses", async () => {
    const a = admin();
    expect(await signForCaller(a, me, "prop-refs", `${other}/x.png`, 60)).toEqual({ ok: false, status: 403, error: "storage_path_forbidden" });
    expect(await signForCaller(a, me, "prop-refs", "../x.png", 60)).toEqual({ ok: false, status: 400, error: "invalid_storage_path" });
    expect(await signForCaller(a, me, "bad bucket!", `${me}/x.png`, 60)).toMatchObject({ status: 400 });
    expect(a.createSignedUrl).not.toHaveBeenCalled();
    expect(await signForCaller(a, me, "prop-refs", `${me}/x.png`, 60)).toMatchObject({ ok: true, via: "owner" });
    expect(await signForCaller(admin([], "Object not found"), me, "prop-refs", `${me}/x.png`, 60)).toEqual({ ok: false, status: 404, error: "storage_object_not_found" });
  });
});
