import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(process.argv[2], "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const st = JSON.parse(readFileSync(process.argv[3], "utf8"));
const A = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
await A.auth.setSession(st.A); const aId = (await A.auth.getUser()).data.user.id;
for (const bucket of ["prop-refs", "project-references"]) {
  const dir = `${aId}/sec4-fixture`; const l = await A.storage.from(bucket).list(dir);
  const names = (l.data ?? []).map((o) => `${dir}/${o.name}`); const r = await A.storage.from(bucket).remove(names);
  console.log(bucket, "removed", r.data?.length ?? 0, "left", ((await A.storage.from(bucket).list(dir)).data ?? []).length);
}
