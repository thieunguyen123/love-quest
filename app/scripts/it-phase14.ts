/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp Phase 14 (sheet 1 mục L): GRM-01..03 ngữ pháp — đáp án bí mật, chấm ở server, thưởng lần đầu đạt, nhiệm vụ ngày (TC-58..60)
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame, coins } from "./it-lib";
import { loadGrammar } from "./seed-grammar";

async function main() {
  await resetGame();
  const m = await moheoLogin(), u = await utdacLogin();
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const err = async (p: PromiseLike<{ error: any }>) => (await p).error?.message;

  // nội dung file seed hợp lệ
  const all = loadGrammar();
  const bad = all.flatMap((l) => (l.questions as any[]).filter((q) => !q.q.includes("___") || q.options.length !== 4 || new Set(q.options).size !== 4 || q.answer < 0 || q.answer > 3).map((q) => `${l.code}: ${q.q}`));
  ok(bad.length === 0, `File seed: mọi câu có "___", 4 lựa chọn khác nhau, đáp án 0..3 (${all.length} bài)`, bad.slice(0, 5));
  ok(new Set(all.map((l) => l.order_no)).size === all.length && new Set(all.map((l) => l.code)).size === all.length, "Mã bài & thứ tự không trùng");

  const lessons = (await m.c.from("grammar_lessons").select("id,code,order_no").order("order_no")).data ?? [];
  ok(lessons.length === all.length, `Người chơi thấy ${lessons.length} bài ngữ pháp`);
  ok(((await m.c.from("grammar_questions").select("id,answer").limit(5)).data ?? []).length === 0, "TC-58 người chơi KHÔNG đọc được bảng câu hỏi (đáp án)");

  const L = lessons[0];
  const key = new Map(((await admin.from("grammar_questions").select("q,answer").eq("lesson_id", L.id)).data ?? []).map((q: any) => [q.q, q.answer as number]));
  const play = async (who: typeof m, right: number) => {
    const s = await who.c.rpc("grammar_start", { p_lesson: L.id });
    if (s.error) throw s.error;
    const qs = s.data.questions as any[];
    for (let i = 0; i < qs.length; i++) {
      const a = key.get(qs[i].q)!;
      const r = await who.c.rpc("grammar_answer", { p_attempt: s.data.attempt, p_index: i, p_choice: i < right ? a : (a + 1) % 4 });
      if (r.error) throw r.error;
    }
    return { s, f: await who.c.rpc("grammar_finish", { p_attempt: s.data.attempt }) };
  };

  const s0 = await m.c.rpc("grammar_start", { p_lesson: L.id });
  ok(!s0.error && s0.data.questions.length === 10 && s0.data.questions.every((q: any) => !("answer" in q) && q.options.length === 4), "Bắt đầu: 10 câu, không kèm đáp án", s0.error);
  const a0 = key.get(s0.data.questions[0].q)!;
  const r1 = await m.c.rpc("grammar_answer", { p_attempt: s0.data.attempt, p_index: 0, p_choice: a0 });
  ok(r1.data?.correct === true && r1.data?.answer === a0 && !!r1.data?.explain, "Trả lời đúng → correct + giải thích");
  ok(await err(m.c.rpc("grammar_answer", { p_attempt: s0.data.attempt, p_index: 0, p_choice: 0 })) === "ALREADY_ANSWERED", "TC-58 trả lời 1 câu 2 lần bị chặn");
  ok(await err(u.c.rpc("grammar_answer", { p_attempt: s0.data.attempt, p_index: 1, p_choice: 0 })) === "ATTEMPT_NOT_FOUND", "Không trả lời hộ bài của người khác");
  const c0 = await coins(m.id);
  const f0 = await m.c.rpc("grammar_finish", { p_attempt: s0.data.attempt });
  ok(f0.data?.correct === 1 && f0.data?.passed === false && f0.data?.coins === 0 && await coins(m.id) === c0, "Nộp khi mới đúng 1/10 → chưa đạt, không xu", f0.data);
  ok(await err(m.c.rpc("grammar_finish", { p_attempt: s0.data.attempt })) === "ATTEMPT_FINISHED", "Không nộp lại bài đã nộp");

  const p1 = await play(m, 7);
  ok(p1.f.data?.passed === true && p1.f.data?.coins === 80 && await coins(m.id) === c0 + 80, "TC-59 đạt lần đầu (7/10) → +80 xu", p1.f.data);
  const tx = (await admin.from("coin_transactions").select("reason,amount").eq("user_id", m.id).order("id", { ascending: false }).limit(1)).data![0];
  ok(tx.reason === "GRAMMAR" && tx.amount === 80, "Ghi sổ cái lý do GRAMMAR", tx);
  const p2 = await play(m, 10);
  ok(p2.f.data?.passed === true && p2.f.data?.coins === 0 && await coins(m.id) === c0 + 80, "Đạt lần 2 (10/10) → không cộng thêm", p2.f.data);
  const pr = (await admin.from("grammar_progress").select("*").eq("user_id", m.id).eq("lesson_id", L.id).single()).data;
  ok(pr.best_correct === 10 && pr.attempts === 3 && pr.passed_at && pr.rewarded, "Tiến độ: cao nhất 10/10, 3 lần làm, đã đạt", pr);
  ok(((await u.c.from("grammar_progress").select("user_id").eq("user_id", m.id)).data ?? []).length === 1, "Người ấy xem được tiến độ ngữ pháp");

  // nhiệm vụ ngày
  const st = (await m.c.rpc("daily_rewards_status")).data;
  const gq = st.quests.find((q: any) => q.code === "grammar1");
  ok(gq && gq.progress === 1, "TC-60 nhiệm vụ 'Làm 1 bài ngữ pháp' đạt 1/1", gq);
  ok(!(await m.c.rpc("claim_quest", { p_code: "grammar1" })).error, "Nhận nhiệm vụ ngữ pháp");
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
