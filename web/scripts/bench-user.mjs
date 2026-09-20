// Creates (or reuses) a local-only benchmark user and writes its session cookie header to argv[2].
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { writeFileSync } from "node:fs";

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = process.env;
if (!/127\.0\.0\.1|localhost/.test(API_URL)) throw new Error("local Supabase only");
const email = "bench@roamr.test";
const password = "bench-password-123";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error && !/already/i.test(error.message)) throw error;
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const user = list.users.find((u) => u.email === email);
await admin
  .from("profiles")
  .update({ username: "benchuser", display_name: "Bench" })
  .eq("id", user.id);

const jar = new Map();
const ssr = createServerClient(API_URL, ANON_KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (c) => c.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error: signInError } = await ssr.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;
writeFileSync(process.argv[2], [...jar].map(([n, v]) => `${n}=${v}`).join("; "));
console.log("user", user.id, "cookies", [...jar.keys()].join(","));
