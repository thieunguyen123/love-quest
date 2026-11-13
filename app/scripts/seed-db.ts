/* eslint-disable @typescript-eslint/no-explicit-any */
// Nạp dữ liệu seed vào Supabase (local hoặc cloud theo .env.local). Chạy: npm run seed:db
// Tạo 2 tài khoản dev + cặp đôi nếu chưa có. KHÔNG dùng mật khẩu này cho production.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
config({ path: path.resolve(__dirname, "../.env.local") });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const load = (f: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../supabase/seed", f), "utf8"));
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };

async function main() {
  must(await sb.from("game_config").upsert(load("game_config.json").map((c: any) => ({ key: c.key, value: c.value, unit: c.unit, description: c.description }))));

  const levels = load("levels.json");
  must(await sb.from("levels").upsert(levels.map((l: any) => ({
    order_no: l.order_no, topic_en: l.topic_en, topic_vi: l.topic_vi, cefr: l.cefr, word_count: l.word_count,
    question_count: l.question_count, seconds_per_question: l.seconds_per_question, question_types: l.question_types,
    reward_multiplier: l.reward_multiplier,
  })), { onConflict: "order_no", ignoreDuplicates: false }));
  // Màn 1 mở sẵn, màn khác giữ nguyên trạng thái hiện có
  await sb.from("levels").update({ status: "OPEN", opened_at: new Date().toISOString() }).eq("order_no", 1).eq("status", "LOCKED");

  const { data: lv } = await sb.from("levels").select("id,order_no");
  const idOf = new Map(lv!.map((l: any) => [l.order_no, l.id]));
  const words = load("words.json").map((w: any) => ({
    level_id: idOf.get(w.level), word: w.word, ipa: w.ipa, part_of_speech: w.part_of_speech,
    meanings_vi: w.meanings_vi, example_en: w.example_en, example_vi: w.example_vi,
  }));
  must(await sb.from("words").upsert(words, { onConflict: "level_id,word" }));

  // 2 tài khoản dev
  const users = [
    { email: "utdac@lovequest.local", password: "utdac-dev-2026", name: "Út đặc", role: "ADMIN" },
    { email: "moheo@lovequest.local", password: "moheo-dev-2026", name: "Mỡ heo", role: "PLAYER" },
  ];
  const ids: string[] = [];
  for (const u of users) {
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    let found = list?.users.find((x) => x.email === u.email);
    if (!found) {
      const r = await sb.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true, user_metadata: { role: u.role } });
      if (r.error) throw r.error;
      found = r.data.user!;
      console.log("Đã tạo", u.email, "/", u.password);
    }
    ids.push(found.id);
  }
  const { data: c } = await sb.from("couples").select("id").limit(1);
  if (!c?.length) must(await sb.from("couples").insert({ player_a: ids[0], player_b: ids[1] }));
  console.log("Seed xong:", { levels: levels.length, words: words.length });
}
main().catch((e) => { console.error(e); process.exit(1); });
