/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp Phase 4 – màn chơi thi đấu (LVL-*), chạy trên DB local đã seed
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame, coins } from "./it-lib";

type U = { c: SupabaseClient; id: string };
const lvl = async (n: number) => (await admin.from("levels").select("*").eq("order_no", n).single()).data as any;
const inv = async (id: string, t: string) => (await admin.from("inventory").select("quantity").eq("user_id", id).eq("item_type", t).maybeSingle()).data?.quantity ?? 0;

// Chơi hết một lượt. mode: "right" = đáp án đúng ngay, "wrong" = đáp án sai, n = chỉ trả lời n câu rồi dừng
async function play(u: U, levelNo: number, mode: "right" | "wrong", opts: { stopAfter?: number; ranked?: boolean } = {}) {
  const l = await lvl(levelNo);
  const st = await u.c.rpc("start_attempt", { p_level: l.id, p_mode: opts.ranked === false ? "PRACTICE" : "RANKED" });
  if (st.error) throw st.error;
  const attempt = st.data as string;
  const { data: a } = await admin.from("level_attempts").select("seed").eq("id", attempt).single();
  let n = 0; const types: string[] = [];
  for (;;) {
    const q = await u.c.rpc("next_question", { p_attempt: attempt });
    if (q.error) throw q.error;
    if (q.data.finished) break;
    if (opts.stopAfter !== undefined && n >= opts.stopAfter) return { attempt, types, n, stopped: true };
    types.push(q.data.type);
    const full = (await admin.rpc("_build_question", { p_level: l.id, p_seed: a!.seed, p_idx: q.data.index, p_types: l.question_types })).data;
    let answer: any;
    if (q.data.type === "MATCH") answer = mode === "right" ? full.accept : [0, 0, 0, 0];
    else answer = mode === "right" ? (q.data.type === "MC_EN_VN" ? full.accept[0] : full.display) : "zzz-sai";
    const r = await u.c.rpc("answer_question", { p_attempt: attempt, p_index: q.data.index, p_answer: answer });
    if (r.error) throw r.error;
    n++;
  }
  const sub = await u.c.rpc("submit_attempt", { p_attempt: attempt });
  if (sub.error) throw sub.error;
  return { attempt, types, n, sub: sub.data };
}

async function main() {
  await resetGame();
  const m = await moheoLogin() as U; const u = await utdacLogin() as U;
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const l1 = await lvl(1);

  // ---- công thức điểm ở SQL ----
  const cp = await admin.rpc("calc_points", { p_correct: true, p_t_ms: 6000, p_limit_ms: 15000, p_streak: 4, p_base: 100, p_speed_max: 50, p_step: 10, p_cap: 50 });
  ok(cp.data?.total === 160, "TC-18 SQL calc_points = 160", cp);

  // ---- khóa / luyện tập ----
  ok((await m.c.rpc("start_attempt", { p_level: (await lvl(2)).id, p_mode: "RANKED" })).error?.message === "LEVEL_LOCKED", "TC-11 màn 2 KHÓA không chơi được");
  const pr = await play(m, 1, "right", { ranked: false });
  ok(pr.n === 10 && (await lvl(1)).status === "OPEN", "LRN-03 luyện tập 10 câu, không đổi trạng thái màn", pr.n);
  ok((await coins(m.id)) === 500, "Luyện tập không thưởng xu");
  const pr2 = await play(m, 1, "wrong", { ranked: false });
  ok(pr2.n === 10, "Luyện tập chơi lại được không giới hạn");

  // ---- màn 1: Mỡ heo chơi trước (toàn đúng) ----
  const r1 = await play(m, 1, "right");
  ok(r1.sub.score === 1850 && r1.sub.correct === 10, "LVL-05 điểm 10 câu đúng liên tiếp = 1850", r1.sub);
  ok(new Set(r1.types).size === 1 && r1.types[0] === "MC_EN_VN", "Màn 1 chỉ có loại câu MC_EN_VN (mở dần theo màn)", r1.types);
  let L = await lvl(1);
  ok(L.status === "COUNTDOWN" && !!L.deadline_at, "TC-12 người đầu xong → ĐẾM NGƯỢC", L);
  const hrs = (Date.parse(L.deadline_at) - Date.parse(L.first_finished_at)) / 3600000;
  ok(Math.abs(hrs - 48) < 0.01, "Deadline = +48 giờ", hrs);
  const ovU = (await u.c.rpc("level_overview", { p_order: 1 })).data;
  ok(ovU.partner_finished === true && ovU.partner === null, "LVL-06 Út đặc thấy 'đã hoàn thành' nhưng KHÔNG thấy điểm", ovU);
  ok((await u.c.from("level_attempts").select("score").eq("user_id", m.id)).data!.length === 0, "LVL-06 API không trả điểm người ấy qua bảng");
  const nf = (await admin.from("notifications").select("type").eq("user_id", u.id).eq("type", "PARTNER_FINISHED")).data!;
  ok(nf.length === 1, "NOT-01 Út đặc nhận thông báo người ấy xong", nf);
  ok((await m.c.rpc("start_attempt", { p_level: l1.id, p_mode: "RANKED" })).error?.message === "ALREADY_PLAYED", "TC-16 không chơi lượt tính điểm thứ 2");
  ok((await m.c.rpc("answer_question", { p_attempt: r1.attempt, p_index: 0, p_answer: "x" })).error?.message === "ATTEMPT_FINISHED", "Không nộp thêm câu sau khi đã nộp bài");

  // ---- Út đặc chơi sau (toàn sai) → đóng ngay ----
  const r2 = await play(u, 1, "wrong");
  ok(r2.sub.score === 0, "Toàn sai = 0 điểm", r2.sub);
  L = await lvl(1);
  ok(L.status === "CLOSED" && L.winner_id === m.id && !L.is_draw, "TC-13 màn đóng ngay, Mỡ heo thắng", L);
  ok((await coins(m.id)) === 500 + 200, "Người thắng +200 xu", await coins(m.id));
  ok((await coins(u.id)) === 500 + 60, "Người thua có chơi +30% = 60 xu", await coins(u.id));
  ok((await inv(m.id, "PET_UPGRADE")) === 2 && (await inv(m.id, "WEAPON_LICENSE")) === 0 && (await inv(m.id, "ARMY_UPGRADE")) === 1, "Thắng nhận 2 Nâng cấp thú cưng + 1 Nâng cấp quân (không còn Quyền mua vũ khí)");
  ok((await inv(u.id, "PET_UPGRADE")) === 0, "Thua không có token");
  ok((await lvl(2)).status === "OPEN", "LVL-02 màn 2 mở khi màn 1 đóng");
  const before = [await coins(m.id), await coins(u.id)];
  await admin.rpc("close_level", { p_level: l1.id }); await admin.rpc("cron_tick");
  ok((await coins(m.id)) === before[0] && (await coins(u.id)) === before[1], "TC-19 gọi close_level/cron lại không trao thưởng lần 2");
  const ovAfter = (await u.c.rpc("level_overview", { p_order: 1 })).data;
  ok(ovAfter.partner?.score === 1850, "Màn đóng → thấy điểm người ấy", ovAfter);
  ok((await u.c.rpc("start_attempt", { p_level: l1.id, p_mode: "RANKED" })).error?.message === "LEVEL_CLOSED", "Màn đã đóng không nộp bài được");
  const rev = (await m.c.rpc("attempt_review", { p_attempt: r2.attempt })).data;
  ok(Array.isArray(rev) && rev.length === 0, "Người khác không xem được review lượt của mình", rev);
  const revOwn = (await u.c.rpc("attempt_review", { p_attempt: r2.attempt })).data;
  ok(revOwn.length === 10 && revOwn.every((x: any) => x.is_correct === false), "LRN-07 review liệt kê 10 từ sai", revOwn.length);

  // ---- màn 2: hết 48h, người kia không chơi → thắng mặc định ----
  const w2 = await play(u, 2, "right");
  const l2 = await lvl(2);
  ok(l2.status === "COUNTDOWN", "Màn 2 vào đếm ngược");
  const c0 = await coins(m.id);
  await admin.from("levels").update({ deadline_at: new Date(Date.now() - 1000).toISOString() }).eq("id", l2.id);
  const tick = await admin.rpc("cron_tick");
  ok(!tick.error, "cron_tick chạy được", tick.error);
  const l2b = await lvl(2);
  ok(l2b.status === "CLOSED" && l2b.winner_id === u.id, "TC-15 hết 48h → người đã chơi thắng mặc định", l2b);
  ok((await coins(m.id)) === c0, "Người không chơi 0 xu");
  ok((await admin.from("notifications").select("id").eq("user_id", m.id).eq("type", "LEVEL_RESULT")).data!.length >= 2, "Có thông báo kết quả cho người không chơi");
  ok((await lvl(3)).status === "OPEN", "Màn 3 mở sau màn 2");
  void w2;

  // ---- màn 3: quay lại giữa chừng & hết giờ câu ----
  const s3 = await play(m, 3, "right", { stopAfter: 2 }) as any;
  ok(s3.stopped && s3.n === 2, "Trả lời 2 câu rồi 'đóng tab'");
  const re = await m.c.rpc("next_question", { p_attempt: s3.attempt });
  ok(re.data.index === 2 && !re.data.finished, "TC-17 quay lại trong hạn → chơi tiếp từ câu 3", re.data);
  await admin.from("attempt_answers").update({ served_at: new Date(Date.now() - 120000).toISOString() }).eq("attempt_id", s3.attempt).eq("q_index", 2);
  const re2 = await m.c.rpc("next_question", { p_attempt: s3.attempt });
  ok(re2.data.index === 3, "Câu đang dở hết giờ → tính sai, sang câu sau", re2.data);
  const ans2 = (await admin.from("attempt_answers").select("is_correct,points").eq("attempt_id", s3.attempt).eq("q_index", 2).single()).data!;
  ok(ans2.is_correct === false && ans2.points === 0, "Hết giờ = 0 điểm");
  await admin.from("level_attempts").update({ last_active_at: new Date(Date.now() - 11 * 60000).toISOString() }).eq("id", s3.attempt);
  const re3 = await m.c.rpc("next_question", { p_attempt: s3.attempt });
  ok(re3.data.finished === true && re3.data.expired === true, "TC-17 quá 10 phút → tự nộp bài", re3.data);
  const att = (await admin.from("level_attempts").select("status,score").eq("id", s3.attempt).single()).data!;
  ok(att.status === "SUBMITTED" && att.score === 150 + 160, "Tự nộp với điểm hiện có (150 + 160)", att);
  ok((await lvl(3)).status === "COUNTDOWN", "Tự nộp cũng kích hoạt đếm ngược");
  // đáp án đúng không bị lộ trong dữ liệu gửi client
  const q4 = await u.c.rpc("start_attempt", { p_level: (await lvl(3)).id, p_mode: "RANKED" });
  const nq = await u.c.rpc("next_question", { p_attempt: q4.data });
  ok(!("accept" in nq.data) && !("correct" in nq.data) && JSON.stringify(nq.data).indexOf("display") < 0, "Payload câu hỏi không chứa đáp án", Object.keys(nq.data));
  const mt = nq.data.type;
  ok(["MC_EN_VN", "MC_VN_EN", "LISTEN"].includes(mt), "Loại câu hợp lệ", mt);
  // Út đặc chơi nốt bằng đúng → thắng màn 3 (nhưng để test hòa dùng màn 4 sau)
  // hoàn tất lượt đã mở (toàn sai) để đóng màn 3
  for (let i = 0; i < 10; i++) {
    const q = i === 0 ? nq : await u.c.rpc("next_question", { p_attempt: q4.data });
    if (q.data.finished) break;
    await u.c.rpc("answer_question", { p_attempt: q4.data, p_index: q.data.index, p_answer: "zzz" });
  }
  await u.c.rpc("submit_attempt", { p_attempt: q4.data });
  ok((await lvl(3)).status === "CLOSED" && (await lvl(3)).winner_id === m.id, "Màn 3: Mỡ heo (310) thắng Út đặc (0)");

  const pr3 = await play(u, 3, "right", { ranked: false });
  ok(new Set(pr3.types).size === 3, "Màn 3 trộn đủ 3 loại câu (MC_EN_VN, MC_VN_EN, LISTEN)", pr3.types);

  // ---- màn 4: HÒA (2 người trả lời đúng y hệt, thời gian 0) ----
  const d1 = await play(m, 4, "right"); const d2 = await play(u, 4, "right");
  const l4 = await lvl(4);
  ok(d1.sub.score === d2.sub.score && l4.is_draw === true && l4.winner_id === null, "LVL-08 bằng điểm & thời gian → HÒA", l4);
  ok((await inv(m.id, "PET_UPGRADE")) === (2 + 2 + 1) && (await inv(u.id, "PET_UPGRADE")) === 3, "Hòa: mỗi người +1 Nâng cấp thú cưng (thắng màn nhận 2: Mỡ heo thắng 2 màn + hòa, Út đặc thắng 1 màn + hòa)");
  // ---- đủ 6 loại câu hỏi (SPELL, MATCH, FILL...) ----
  await admin.from("levels").update({ question_types: ["MC_EN_VN", "MC_VN_EN", "LISTEN", "SPELL", "MATCH", "FILL"] }).eq("order_no", 4);
  const all = await play(u, 4, "right", { ranked: false });
  ok(new Set(all.types).size === 6, "Practice trộn đủ 6 loại câu", all.types);
  const aAll = (await admin.from("level_attempts").select("correct_count,score").eq("id", all.attempt).single()).data!;
  ok(aAll.correct_count === 10, "Trả lời đúng cả SPELL / MATCH / FILL / LISTEN", aAll);
  const bad = await play(u, 4, "wrong", { ranked: false });
  const aBad = (await admin.from("level_attempts").select("correct_count,score").eq("id", bad.attempt).single()).data!;
  ok(aBad.correct_count === 0 && aBad.score <= 25, "Trả lời sai cả 6 loại: 0 câu đúng (MATCH có thể được tối đa 25 điểm một phần)", aBad);
  const lv4 = await lvl(4);
  const qs = [];
  for (let i = 0; i < 6; i++) qs.push((await admin.rpc("_build_question", { p_level: lv4.id, p_seed: 7, p_idx: i, p_types: lv4.question_types })).data);
  const f = qs.find((q: any) => q.type === "FILL"), sp = qs.find((q: any) => q.type === "SPELL"), mtc = qs.find((q: any) => q.type === "MATCH");
  ok(f.public.sentence.includes("_____") && !f.public.sentence.toLowerCase().includes(f.display.toLowerCase()), "FILL: câu khuyết đã che từ", f.public);
  ok(sp.public.letters.slice().sort().join("") === sp.accept[0].split("").sort().join(""), "SPELL: chữ cái xáo đủ ký tự", sp.public);
  ok(mtc.public.pairs_en.length === 4 && mtc.accept.length === 4 && new Set(mtc.accept).size === 4, "MATCH: 4 cặp, ánh xạ hoán vị", mtc);
  const same = (await admin.rpc("_build_question", { p_level: lv4.id, p_seed: 7, p_idx: 2, p_types: lv4.question_types })).data;
  ok(JSON.stringify(same) === JSON.stringify(qs[2]), "LVL-04 cùng seed → cùng câu hỏi (2 người cùng đề)");
  const ledgerM = (await admin.from("coin_transactions").select("amount").eq("user_id", m.id)).data!.reduce((a: number, t: any) => a + t.amount, 0);
  ok(ledgerM === (await coins(m.id)), "ECO-01 sổ cái = số dư");
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
