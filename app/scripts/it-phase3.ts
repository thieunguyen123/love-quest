// Test tích hợp Phase 3 – mưa chữ
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame, levelId, coins } from "./it-lib";

async function main() {
  await resetGame();
  const m = await moheoLogin(); const u = await utdacLogin();
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const l1 = await levelId(1);
  const { data: ws } = await m.c.from("words").select("id").eq("level_id", l1).limit(3);
  const hit = ws!.map((w: any) => w.id);

  const r1 = await m.c.rpc("claim_typing_session", { p_source: l1, p_hit: 25, p_missed: 2, p_duration_ms: 60000, p_hit_ids: [...hit, hit[0]], p_missed_ids: [hit[1]] });
  ok(!r1.error && r1.data.coins_earned === 40, "LRN-05 25 từ = 40 xu (20 xu / 10 từ)", r1);
  ok(await coins(m.id) === 540, "Số dư 500 + 40");
  const { data: wp } = await admin.from("word_progress").select("word_id,correct_count,wrong_count").eq("user_id", m.id);
  const w0 = wp!.find((x: any) => x.word_id === hit[0]);
  ok(w0?.correct_count === 2 && wp!.find((x: any) => x.word_id === hit[1])?.wrong_count === 1, "LRN-06 sổ từ cập nhật đúng/sai", wp);

  ok((await m.c.rpc("claim_typing_session", { p_source: null, p_hit: 100, p_missed: 0, p_duration_ms: 1000, p_hit_ids: [], p_missed_ids: [] })).error?.message === "INVALID_SESSION", "Chống gian lận: 100 từ trong 1 giây bị chặn");
  const l4 = await levelId(4);
  ok((await m.c.rpc("claim_typing_session", { p_source: l4, p_hit: 1, p_missed: 0, p_duration_ms: 5000, p_hit_ids: [], p_missed_ids: [] })).error?.message === "LEVEL_LOCKED", "Nguồn từ màn KHÓA bị chặn");

  // TC-10 trần 300 xu/ngày: đã có 40, thêm ván 300 từ (=600 xu) → chỉ +260
  const r2 = await m.c.rpc("claim_typing_session", { p_source: null, p_hit: 300, p_missed: 0, p_duration_ms: 400000, p_hit_ids: [], p_missed_ids: [] });
  ok(r2.data.coins_earned === 260 && r2.data.capped === true && r2.data.today_total === 300, "TC-10 áp trần 300 xu/ngày", r2);
  const r3 = await m.c.rpc("claim_typing_session", { p_source: null, p_hit: 50, p_missed: 0, p_duration_ms: 100000, p_hit_ids: [], p_missed_ids: [] });
  ok(r3.data.coins_earned === 0, "Sau trần: không nhận thêm xu nhưng ván vẫn ghi", r3);
  ok(r3.data.record === 300, "Kỷ lục = 300 từ");
  const { data: sum } = await admin.from("coin_transactions").select("amount").eq("user_id", m.id);
  ok(sum!.reduce((a: number, t: any) => a + t.amount, 0) === await coins(m.id), "Sổ cái khớp số dư");
  const { data: seen } = await u.c.from("typing_sessions").select("user_id").eq("user_id", m.id);
  ok(seen!.length === 3, "Người ấy thấy được kỷ lục (so sánh)");
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
