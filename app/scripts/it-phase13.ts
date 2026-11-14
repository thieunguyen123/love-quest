/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp Phase 13 (sheet 1 mục K): DAY-01 điểm danh 7 ngày, DAY-02 nhiệm vụ ngày, DAY-03 rương & thưởng đôi (TC-55..57)
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame, coins, levelId } from "./it-lib";

const vnDay = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(Date.now() + offset * 86400000));

async function main() {
  await resetGame();
  const m = await moheoLogin(), u = await utdacLogin();
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const err = async (p: PromiseLike<{ error: any }>) => (await p).error?.message;
  const status = async (who = m) => (await who.c.rpc("daily_rewards_status")).data as any;
  const tok = async (id: string) => (await admin.from("inventory").select("quantity").eq("user_id", id).eq("item_type", "PET_UPGRADE").maybeSingle()).data?.quantity ?? 0;

  // ---- DAY-01 điểm danh ----
  let s = await status();
  ok(s.login.claimed === false && s.login.streak === 1 && s.login.rewards.join() === "250,300,350,400,450,500,550", "Chưa điểm danh: ngày 1, bảng 250→550 xu", s.login);
  let c0 = await coins(m.id);
  let r = await m.c.rpc("claim_daily_login");
  ok(!r.error && r.data.coins === 250 && await coins(m.id) === c0 + 250, "TC-55 ngày 1 nhận 250 xu", r);
  ok(await err(m.c.rpc("claim_daily_login")) === "ALREADY_CLAIMED", "Nhận lần 2 trong ngày bị chặn");
  const tx = (await admin.from("coin_transactions").select("amount,reason").eq("user_id", m.id).order("id", { ascending: false }).limit(1)).data![0];
  ok(tx.reason === "DAILY_LOGIN" && tx.amount === 250, "Ghi sổ cái DAILY_LOGIN", tx);

  // hôm qua là ngày 1 → hôm nay ngày 2
  await admin.from("daily_logins").delete().eq("user_id", m.id);
  await admin.from("daily_logins").insert({ user_id: m.id, day: vnDay(-1), streak: 1, coins: 250 });
  c0 = await coins(m.id); r = await m.c.rpc("claim_daily_login");
  ok(r.data?.streak === 2 && await coins(m.id) === c0 + 300, "Điểm danh liên tiếp: ngày 2 = 300 xu", r);
  // bỏ 1 ngày → về ngày 1
  await admin.from("daily_logins").delete().eq("user_id", m.id);
  await admin.from("daily_logins").insert({ user_id: m.id, day: vnDay(-2), streak: 4, coins: 400 });
  r = await m.c.rpc("claim_daily_login");
  ok(r.data?.streak === 1 && r.data?.coins === 250, "Bỏ lỡ 1 ngày → chuỗi về ngày 1", r);
  // hôm qua ngày 6 → hôm nay ngày 7 (+🐾); hôm qua ngày 7 → về ngày 1
  await admin.from("daily_logins").delete().eq("user_id", m.id);
  await admin.from("daily_logins").insert({ user_id: m.id, day: vnDay(-1), streak: 6, coins: 500 });
  const t0 = await tok(m.id); r = await m.c.rpc("claim_daily_login");
  ok(r.data?.streak === 7 && r.data?.coins === 550 && await tok(m.id) === t0 + 1, "Ngày 7: 550 xu + 1 🐾", r);
  await admin.from("daily_logins").delete().eq("user_id", m.id);
  await admin.from("daily_logins").insert({ user_id: m.id, day: vnDay(-1), streak: 7, coins: 550 });
  ok((await status()).login.streak === 1, "Xong ngày 7 → chuỗi mới bắt đầu ngày 1");

  // ---- DAY-02 nhiệm vụ ----
  s = await status();
  ok(s.quests.length === 6 && s.quests.every((q: any) => q.progress === 0 && !q.claimed), "6 nhiệm vụ, tiến độ 0", s.quests);
  ok(await err(m.c.rpc("claim_quest", { p_code: "study10" })) === "QUEST_NOT_DONE", "TC-56 chưa đủ → QUEST_NOT_DONE");
  const words = (await admin.from("words").select("id").eq("level_id", await levelId(1)).limit(10)).data!;
  for (const w of words) await m.c.rpc("mark_word", { p_word: w.id, p_known: true });
  s = await status();
  ok(s.quests.find((q: any) => q.code === "study10").progress === 10, "Ôn 10 từ → tiến độ 10/10");
  c0 = await coins(m.id); r = await m.c.rpc("claim_quest", { p_code: "study10" });
  ok(!r.error && await coins(m.id) === c0 + 100, "Nhận nhiệm vụ Ôn 10 từ +100 xu", r.error);
  ok(await err(m.c.rpc("claim_quest", { p_code: "study10" })) === "ALREADY_CLAIMED", "Nhận lại → ALREADY_CLAIMED");
  ok(await err(m.c.rpc("claim_quest", { p_code: "_ALL" })) === "QUEST_NOT_DONE", "Rương khoá khi chưa nhận hết nhiệm vụ");

  // Mưa chữ 2 ván (25 + 20 chữ)
  for (const hit of [25, 20]) { const t = await m.c.rpc("claim_typing_session", { p_source: null, p_hit: hit, p_missed: 1, p_duration_ms: 60000, p_hit_ids: [], p_missed_ids: [] }); if (t.error) console.log(t.error); }
  // 1 lượt luyện tập nộp bài, đúng 15 câu
  await admin.from("level_attempts").insert({ level_id: await levelId(1), user_id: m.id, mode: "PRACTICE", status: "SUBMITTED", seed: 1, question_count: 20, seconds_per_question: 10, submitted_at: new Date().toISOString(), correct_count: 15 });
  for (const code of ["typing2", "typing40", "level1", "correct15"]) {
    const q = await m.c.rpc("claim_quest", { p_code: code });
    ok(!q.error, `Nhận nhiệm vụ ${code}`, q.error);
  }
  ok(await err(m.c.rpc("claim_quest", { p_code: "attack1" })) === "QUEST_NOT_DONE", "Nhiệm vụ tấn công chưa làm");

  // ---- DAY-03 rương + thưởng đôi ----
  c0 = await coins(m.id); const t1 = await tok(m.id);
  r = await m.c.rpc("claim_quest", { p_code: "_ALL" });
  ok(!r.error && await coins(m.id) === c0 + 200 && await tok(m.id) === t1 + 1, "TC-57 mở rương (không cần nhiệm vụ tuỳ chọn): +200 xu +1 🐾", r.error);
  ok(await err(m.c.rpc("claim_quest", { p_code: "_COUPLE" })) === "QUEST_NOT_DONE", "Người ấy chưa mở rương → thưởng đôi khoá");
  const n = (await admin.from("notifications").select("title").eq("user_id", u.id).eq("type", "QUEST")).data ?? [];
  ok(n.length === 1, "Người ấy nhận thông báo đã mở rương", n);
  // người ấy làm xong hết (giả lập: ghi nhận nhiệm vụ bắt buộc)
  await admin.from("quest_claims").insert(["study10", "typing2", "typing40", "level1", "correct15"].map((code) => ({ user_id: u.id, day: vnDay(), code, coins: 0 })));
  ok(!(await u.c.rpc("claim_quest", { p_code: "_ALL" })).error, "Người ấy mở rương");
  c0 = await coins(m.id); r = await m.c.rpc("claim_quest", { p_code: "_COUPLE" });
  ok(!r.error && await coins(m.id) === c0 + 150, "Cả hai mở rương → 💞 thưởng đôi +150 xu", r.error);
  s = await status();
  ok(s.chest.claimed && s.couple.claimed && s.couple.partner_done, "Trạng thái rương & thưởng đôi đúng", s);
  // RLS: không đọc được điểm danh của người ấy
  ok(((await m.c.from("daily_logins").select("user_id").eq("user_id", u.id)).data ?? []).length === 0, "RLS: không đọc điểm danh của người ấy");
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
