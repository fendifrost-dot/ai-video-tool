import { describe, expect, it, vi } from "vitest";
import { callerMayRead, callerMayWrite, callerOwnsArtist, signForCaller, wellFormedObjectPath } from "./storageAccess.ts";

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

describe("callerOwnsArtist / two-segment legacy keys", () => {
  const adminWith = (rows: Record<string, unknown>[], error: unknown = null) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[0] ?? null, error }), eq: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: rows, error }) }) }) }) }) }) }),
  });
  it("owner of the artist row passes; another user's artist is refused; a lookup error refuses", async () => {
    const me = "3ca10935-8c3d-4479-9a0c-8bfe8050840c", artist = "11111111-1111-4111-8111-111111111111";
    expect((await callerOwnsArtist(adminWith([{ user_id: me }]), me, artist)).ok).toBe(true);
    expect(await callerOwnsArtist(adminWith([{ user_id: "other" }]), me, artist)).toEqual({ ok: false, reason: "not_owner" });
    expect(await callerOwnsArtist(adminWith([], { message: "down" }), me, artist)).toEqual({ ok: false, reason: "lookup_failed" });
    expect(await callerOwnsArtist(adminWith([{ user_id: me }]), me, "not-a-uuid")).toEqual({ ok: false, reason: "invalid_path" });
  });
  it("a legacy grant never covers a two-segment key (matches storage.foldername(name)[2] being NULL)", async () => {
    const me = "3ca10935-8c3d-4479-9a0c-8bfe8050840c", folder = "22222222-2222-4222-8222-222222222222", project = "33333333-3333-4333-8333-333333333333";
    const admin = adminWith([{ user_id: me }]);
    expect(await callerMayRead(admin, me, "project-references", `${folder}/${project}`)).toEqual({ ok: false, reason: "not_owner" });
    expect((await callerMayRead(admin, me, "project-references", `${folder}/${project}/x.png`)).ok).toBe(true);
  });
});
