/* eslint-disable @typescript-eslint/no-explicit-any */
// Nạp dữ liệu seed vào Supabase (local hoặc cloud theo .env.local). Chạy: npm run seed:db
// Tạo 2 tài khoản dev + cặp đôi nếu chưa có. KHÔNG dùng mật khẩu này cho production.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { parseWordsCsv, WORD_HEADER } from "../src/lib/csv";
import { generateObstacles } from "../src/lib/game/obstacles";
import { seedGrammar } from "./seed-grammar";
config({ path: path.resolve(__dirname, "..", process.env.IT_ENV ?? ".env.local") });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const load = (f: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../supabase/seed", f), "utf8"));
const must = <T,>(r: { data: T; error: any }) => { if (r.error) throw r.error; return r.data; };

async function main() {
  must(await sb.from("game_config").upsert(load("game_config.json").map((c: any) => ({ key: c.key, value: c.value, unit: c.unit, description: c.description }))));

  must(await sb.from("shop_items").upsert(load("shop_items.json")));

  // BASE-13: vật cản vòng ngoài căn cứ (sinh xác định từ cấu hình; dùng chung cho mọi người chơi)
  const cfg = new Map<string, number>(load("game_config.json").map((c: any) => [c.key, Number(c.value)]));
  const obs = generateObstacles(cfg.get("BASE_GRID_SIZE") ?? 30, cfg.get("BASE_FREE_SIZE") ?? 20, cfg.get("OBSTACLE_COST_PER_CELL") ?? 150, cfg.get("OBSTACLE_DENSITY") ?? 0.75);
  must(await sb.from("obstacles").upsert(obs));
  must(await sb.from("obstacles").delete().not("id", "in", `(${obs.map((o) => o.id).join(",")})`));

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
  // Từ vựng bổ sung: mọi file supabase/seed/words_*.csv (cùng định dạng CSV import ở trang Admin), gom theo màn
  const seedDir = path.resolve(__dirname, "../supabase/seed");
  const csvLines = new Map<number, string[]>();
  for (const f of fs.readdirSync(seedDir).filter((f) => /^words_.*\.csv$/.test(f)).sort()) {
    const [, ...lines] = fs.readFileSync(path.join(seedDir, f), "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
    for (const l of lines) { const n = Number(l.split(",")[0]); if (l.trim() && n) (csvLines.get(n) ?? csvLines.set(n, []).get(n)!).push(l); }
  }
  let extra = 0;
  for (const [lvNo, lines] of [...csvLines].sort((a, b) => a[0] - b[0])) {
    const r = parseWordsCsv([WORD_HEADER.join(","), ...lines].join("\n"), lvNo);
    if (r.errors.length) throw new Error(`Màn ${lvNo}: ` + r.errors.join("; "));
    must(await sb.from("words").upsert(r.words.map((w) => ({ ...w, level_id: idOf.get(lvNo) })), { onConflict: "level_id,word" }));
    extra += r.words.length;
  }

  console.log("Ngữ pháp:", await seedGrammar(sb as any));

  // Tài khoản & cặp đôi.
  // Production: đặt SEED_COUPLE="email_admin,email_nguoi_choi" (2 tài khoản đã tạo sẵn ở Supabase Dashboard) → KHÔNG tạo tài khoản dev,
  // người thứ nhất thành ADMIN, ghép đôi 2 người. Không đặt → tạo 2 tài khoản dev (chỉ dùng local).
  const ids: string[] = [];
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (process.env.SEED_SKIP_USERS) {
    // Production với đăng ký tự do (AUTH-01): không tạo tài khoản nào — người đầu tiên đăng ký là Admin, người thứ hai tự ghép đôi
    console.log("Seed xong (không tạo tài khoản):", { levels: levels.length, words: words.length + extra, obstacles: obs.length });
    return;
  }
  if (process.env.SEED_COUPLE) {
    const emails = process.env.SEED_COUPLE.split(",").map((e) => e.trim().toLowerCase());
    if (emails.length !== 2) throw new Error("SEED_COUPLE phải có đúng 2 email, cách nhau dấu phẩy");
    for (const e of emails) {
      const u = list?.users.find((x) => x.email?.toLowerCase() === e);
      if (!u) throw new Error(`Chưa có tài khoản ${e} — tạo ở Supabase Dashboard → Authentication → Add user (tick Auto Confirm)`);
      ids.push(u.id);
    }
    must(await sb.from("profiles").update({ role: "ADMIN" }).eq("id", ids[0]));
  } else {
    const users = [
      { email: "utdac@lovequest.local", password: "utdac-dev-2026", name: "Út đặc", role: "ADMIN" },
      { email: "moheo@lovequest.local", password: "moheo-dev-2026", name: "Mỡ heo", role: "PLAYER" },
    ];
    for (const u of users) {
      let found = list?.users.find((x) => x.email === u.email);
      if (!found) {
        const r = await sb.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true, user_metadata: { role: u.role } });
        if (r.error) throw r.error;
        found = r.data.user!;
        console.log("Đã tạo", u.email, "/", u.password);
      }
      ids.push(found.id);
    }
  }
  const { data: c } = await sb.from("couples").select("id").limit(1);
  if (!c?.length) must(await sb.from("couples").insert({ player_a: ids[0], player_b: ids[1] }));
  console.log("Seed xong:", { levels: levels.length, words: words.length + extra, obstacles: obs.length });
}
main().catch((e) => { console.error(e); process.exit(1); });
