// Gives the benchmark user a realistic feed: 3 cities, 24 moments with real (tiny) photo objects.
import { createClient } from "@supabase/supabase-js";
const { API_URL, SERVICE_ROLE_KEY } = process.env;
if (!/127\.0\.0\.1|localhost/.test(API_URL)) throw new Error("local Supabase only");
const db = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
const uid = users.users.find((u) => u.email === "bench@roamr.test").id;

const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);
const cityNames = ["Chicago", "Paris", "Tokyo"];
const cityIds = [];
for (const [i, name] of cityNames.entries()) {
  const { data } = await db
    .from("cities")
    .upsert(
      {
        provider: "bench",
        provider_place_id: `bench.${i}`,
        name,
        display_name: name,
        lat: 10 + i,
        lng: 20 + i,
      },
      { onConflict: "provider,provider_place_id" },
    )
    .select("id")
    .single();
  const { data: uc } = await db
    .from("user_cities")
    .upsert({ user_id: uid, city_id: data.id }, { onConflict: "user_id,city_id" })
    .select("id")
    .single();
  cityIds.push(uc.id);
}
const { count } = await db
  .from("moments")
  .select("id", { count: "exact", head: true })
  .eq("user_id", uid);
if (!count) {
  for (let i = 0; i < 24; i++) {
    const path = `${uid}/${crypto.randomUUID()}.jpg`;
    await db.storage.from("moment-photos").upload(path, jpeg, { contentType: "image/jpeg" });
    const { error } = await db.from("moments").insert({
      user_id: uid,
      user_city_id: cityIds[i % 3],
      photo_path: path,
      width: 1600,
      height: 1200,
      caption: `Bench moment ${i}`,
    });
    if (error) throw error;
  }
}
const { count: after } = await db
  .from("moments")
  .select("id", { count: "exact", head: true })
  .eq("user_id", uid);
console.log("moments", after);
