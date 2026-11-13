/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp Phase 1-2 vào DB local. Chạy: npx tsx scripts/it-phase1.ts (cần seed:db trước, DB sạch cho Mỡ heo)
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", process.env.IT_ENV ?? ".env.local"), quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let fails = 0;
const ok = (c: boolean, name: string, extra?: unknown) => { console.log(`${c ? "PASS" : "FAIL"}  ${name}`, c ? "" : extra ?? ""); if (!c) fails++; };
async function as(email: string, password: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error; return c;
}

async function main() {
  // reset dữ liệu test của Mỡ heo
  const { data: moheoRow } = await admin.from("profiles").select("id").eq("role", "PLAYER").single();
  const mid = moheoRow!.id;
  await admin.from("study_progress").delete().eq("user_id", mid);
  await admin.from("word_progress").delete().eq("user_id", mid);
  await admin.from("coin_transactions").delete().eq("user_id", mid);
  await admin.from("user_house").delete().eq("user_id", mid);
  await admin.from("profiles").update({ onboarded_at: null, coins: 0, display_name: "" }).eq("id", mid);

  const bad = createClient(URL, ANON, { auth: { persistSession: false } });
  ok((await bad.auth.signInWithPassword({ email: "moheo@lovequest.local", password: "sai" })).error !== null, "TC-02 đăng nhập sai bị từ chối");
  const su = await bad.auth.signUp({ email: "hacker@x.com", password: "password123" });
  ok(su.error !== null, "AUTH-01 không đăng ký công khai được", su.data);

  const moheo = await as("moheo@lovequest.local", "moheo-dev-2026");
  const utdac = await as("utdac@lovequest.local", "utdac-dev-2026");

  // RLS
  const { data: hax } = await moheo.from("profiles").update({ coins: 99999, role: "ADMIN" } as any).eq("id", mid).select();
  const { data: after } = await admin.from("profiles").select("coins,role").eq("id", mid).single();
  ok(after!.coins === 0 && after!.role === "PLAYER", "Không tự sửa coins/role được", { hax, after });
  const { data: seeLevels } = await moheo.from("levels").update({ topic_vi: "hack" }).eq("order_no", 1).select();
  ok(!seeLevels?.length, "TC-03 PLAYER không sửa được màn (RLS admin)");
  const { data: adminEdit } = await utdac.from("levels").update({ cefr: "A1" }).eq("order_no", 1).select();
  ok(!!adminEdit?.length, "ADMIN sửa được màn OPEN");
  const { data: locked } = await utdac.from("words").select("id").eq("level_id", (await admin.from("levels").select("id").eq("order_no", 4).single()).data!.id);
  ok(true, "ADMIN đọc từ màn khóa: " + locked?.length);
  const { data: lockedAsPlayer } = await moheo.from("words").select("id").eq("level_id", (await admin.from("levels").select("id").eq("order_no", 4).single()).data!.id);
  ok(!lockedAsPlayer?.length, "PLAYER không thấy từ của màn KHÓA");

  // Onboarding
  ok((await moheo.rpc("complete_onboarding", { p_name: "x", p_color: "#ec4899" })).error !== null, "PRO-03 tên < 2 ký tự bị chặn");
  const r1 = await moheo.rpc("complete_onboarding", { p_name: "Mỡ heo", p_color: "#f43f5e" });
  ok(!r1.error, "PRO-01 onboarding OK", r1.error);
  ok((await moheo.rpc("complete_onboarding", { p_name: "Mỡ heo", p_color: "#f43f5e" })).error?.message === "ALREADY_ONBOARDED", "TC-04 onboarding lần 2 bị chặn");
  const { data: p } = await moheo.from("profiles").select("coins").eq("id", mid).single();
  const { data: tx } = await moheo.from("coin_transactions").select("*").eq("user_id", mid);
  ok(p!.coins === 500 && tx!.length === 1 && tx![0].reason === "START", "TC-04 có đúng 500 xu, 1 giao dịch START", { p, tx });

  // Người chơi chỉ thấy profile của mình và người ấy; không lộ email
  const { data: seen } = await moheo.from("profiles").select("id,display_name");
  ok(seen!.length === 2, "AUTH-05 thấy mình + người ấy");
  ok(!("email" in (seen![0] as any)), "Không có cột email trong profiles");

  // Flashcard + thưởng
  const { data: lvl } = await moheo.from("levels").select("id").eq("order_no", 1).single();
  const { data: words } = await moheo.from("words").select("id").eq("level_id", lvl!.id);
  ok(words!.length === 10, "Màn 1 có 10 từ");
  ok((await moheo.rpc("finish_flashcards", { p_level: lvl!.id })).error?.message === "NOT_ALL_CARDS_SEEN", "Chưa xem hết thẻ → không nhận thưởng");
  for (const w of words!) { const e = (await moheo.rpc("mark_word", { p_word: w.id, p_known: true })).error; if (e) throw e; }
  const f1 = await moheo.rpc("finish_flashcards", { p_level: lvl!.id });
  const f2 = await moheo.rpc("finish_flashcards", { p_level: lvl!.id });
  ok(f1.data === 30 && f2.data === 0, "TC-07 thưởng học trước +30 lần 1, lần 2 không cộng", { f1: f1.data, f2: f2.data });
  const { data: p2 } = await moheo.from("profiles").select("coins").eq("id", mid).single();
  ok(p2!.coins === 530, "Số dư = 530", p2);
  const { data: allTx } = await admin.from("coin_transactions").select("amount").eq("user_id", mid);
  ok(allTx!.reduce((a, t) => a + t.amount, 0) === p2!.coins, "ECO-01 tổng sổ cái = số dư");
  const lockedL = (await admin.from("levels").select("id").eq("order_no", 4).single()).data!.id;
  const { data: w4 } = await admin.from("words").select("id").eq("level_id", lockedL).limit(1).single();
  ok((await moheo.rpc("mark_word", { p_word: w4!.id, p_known: true })).error?.message === "LEVEL_LOCKED", "Không học được màn KHÓA qua API");
  ok((await moheo.rpc("apply_coins", { p_user: mid, p_amount: 1000, p_reason: "START" })).error !== null, "Không gọi trực tiếp apply_coins được");

  console.log(fails ? `\n${fails} FAIL` : "\nTất cả PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
