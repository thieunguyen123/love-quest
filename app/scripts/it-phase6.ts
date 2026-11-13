/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp Phase 6 – tấn công & khiên (BTL-*)
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame, coins } from "./it-lib";

async function main() {
  await resetGame();
  const m = await moheoLogin(); const u = await utdacLogin();   // m = người phòng thủ, u = người tấn công
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const err = async (p: PromiseLike<{ error: any }>) => (await p).error?.message;
  const hp = async (id: string) => (await admin.from("user_house").select("hp").eq("user_id", id).single()).data!.hp as number;
  const resetDay = async () => { await admin.from("daily_counters").update({ attacks_used: 0 }).eq("user_id", u.id); await admin.from("attacks").update({ created_at: new Date(Date.now() - 3 * 3600000).toISOString() }).eq("defender_id", m.id); };

  // dữ liệu ví dụ sheet 2 mục G
  await admin.from("user_army").insert([{ user_id: u.id, unit_code: "sword", quantity: 8 }, { user_id: u.id, unit_code: "archer", quantity: 2 }, { user_id: m.id, unit_code: "sword", quantity: 5 }]);
  await admin.from("profiles").update({ army_level: 2 }).eq("id", u.id);
  await admin.from("user_weapons").insert({ user_id: u.id, weapon_code: "iron_sword" });
  await admin.from("user_house").update({ level: 1, hp: 500, max_hp: 500 }).eq("user_id", m.id);
  await admin.from("user_pets").insert({ user_id: m.id, pet_code: "corgi", nickname: "Corgi", level: 2 });
  const atk = Number((await admin.rpc("calc_atk", { p_user: u.id })).data), def = Number((await admin.rpc("calc_def", { p_user: m.id })).data);
  ok(Math.abs(atk - 185.9) < 1e-6 && Math.abs(def - 61) < 1e-6, "TC-26 SQL: ATK 185.9, DEF 61", { atk, def });
  ok((await admin.rpc("calc_battle", { p_atk: 100, p_def: 500, p_rand: 1, p_hp: 500 })).data.damage === 10, "Sát thương tối thiểu 10% ATK");

  // ---- khiên của người phòng thủ chặn tấn công ----
  ok(await err(m.c.rpc("activate_shield")) === undefined, "BTL-04 bật khiên miễn phí");
  ok(await err(m.c.rpc("activate_shield")) === "SHIELD_ACTIVE", "Không bật khiên khi đang có khiên");
  ok(await err(u.c.rpc("attack", { p_defender: m.id })) === "TARGET_SHIELDED", "TC-24 đối thủ có khiên → bị chặn");
  ok(await hp(m.id) === 500, "HP không đổi khi bị chặn");
  await admin.from("shields").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("user_id", m.id);
  ok(await err(m.c.rpc("activate_shield")) === "NO_SHIELD", "Hết khiên miễn phí trong ngày → NO_SHIELD");
  const c0 = await coins(m.id);
  ok(await err(m.c.rpc("buy_shield")) === undefined && await coins(m.id) === c0 - 150, "Mua khiên -150 xu");
  ok(await err(m.c.rpc("buy_shield")) === "SHIELD_LIMIT", "Tối đa 1 khiên mua / ngày");
  // khiên miễn phí không cộng dồn: khiên của hôm qua chưa dùng không còn hiệu lực
  await admin.from("shields").delete().eq("user_id", m.id);
  await admin.from("shields").insert({ user_id: m.id, source: "FREE", granted_date: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10) });
  await admin.from("shields").update({ granted_date: "2020-01-01" }).eq("user_id", m.id);
  await admin.from("shields").delete().eq("user_id", m.id).eq("source", "FREE").eq("granted_date", new Date().toISOString().slice(0, 10));
  const act = await m.c.rpc("activate_shield");
  ok(act.error?.message === "NO_SHIELD" || !!(await admin.from("shields").select("id").eq("user_id", m.id).eq("source", "FREE").eq("granted_date", "2020-01-01")).data!.length === true, "TC-28 khiên miễn phí cũ không cộng dồn", act.error);

  // ---- trận đánh theo công thức (random = 1) ----
  await admin.from("shields").delete().eq("user_id", m.id);
  const u0 = await coins(u.id), m1 = await coins(m.id);
  const r = await admin.rpc("_attack", { p_attacker: u.id, p_defender: m.id, p_rand: 1 });
  ok(!r.error && r.data.damage === 125 && r.data.loot === 63 && r.data.hp_after === 375, "BTL-02 sát thương 125, loot 63, HP còn 375", r);
  ok(await hp(m.id) === 375, "HP nhà người bị đánh giảm");
  ok(await coins(u.id) === u0 + 63 && await coins(m.id) === m1, "Người đánh +63 xu; người bị đánh KHÔNG bị trừ xu");
  ok((await admin.from("notifications").select("id").eq("user_id", m.id).eq("type", "ATTACKED")).data!.length === 1, "BTL-05 thông báo bị tấn công");
  ok((await m.c.from("attacks").select("id")).data!.length === 1 && (await u.c.from("attacks").select("id")).data!.length === 1, "Nhật ký trận: cả 2 bên thấy");
  ok(await err(u.c.rpc("attack", { p_defender: m.id })) === "TARGET_PROTECTED", "Bảo hộ 1 giờ sau khi bị đánh");

  // ---- lượt thứ 2 (random thật) ----
  await admin.from("attacks").update({ created_at: new Date(Date.now() - 2 * 3600000).toISOString() }).eq("defender_id", m.id);
  const hpBefore = await hp(m.id);
  const r2 = await u.c.rpc("attack", { p_defender: m.id });
  ok(!r2.error && r2.data.damage >= 112 && r2.data.damage <= 137 && r2.data.hp_after === hpBefore - r2.data.damage, "Lượt 2: sát thương trong [112,137] (random 0.9–1.1)", r2);
  await admin.from("attacks").update({ created_at: new Date(Date.now() - 2 * 3600000).toISOString() }).eq("defender_id", m.id);
  ok(await err(u.c.rpc("attack", { p_defender: m.id })) === "ATTACK_LIMIT", "TC-27 tối đa 2 lần/ngày");
  ok(await err(u.c.rpc("attack", { p_defender: u.id })) === "INVALID_TARGET", "Không tự đánh mình");
  await admin.from("user_army").delete().eq("user_id", m.id);
  const noArmy = await m.c.rpc("attack", { p_defender: u.id });
  ok(noArmy.error?.message === "NO_ARMY", "Không có lính không đánh được", noArmy.error?.message);

  // ---- đi đánh khi đang có khiên → khiên vỡ ----
  await resetDay();
  ok(await err(u.c.rpc("activate_shield")) === undefined, "Út đặc bật khiên");
  const r3 = await admin.rpc("_attack", { p_attacker: u.id, p_defender: m.id, p_rand: 1 });
  ok(r3.data?.shield_broken === true && !(await admin.rpc("has_active_shield", { p_user: u.id })).data, "TC-25 đánh khi có khiên → khiên vỡ", r3);

  // ---- nhà đổ nát ----
  await resetDay();
  await admin.from("user_house").update({ hp: 1 }).eq("user_id", m.id);
  const r4 = await admin.rpc("_attack", { p_attacker: u.id, p_defender: m.id, p_rand: 1 });
  ok(r4.data?.damage === 1 && r4.data?.ruined === true && await hp(m.id) === 0, "Sát thương không vượt HP; nhà đổ nát (HP=0)", r4);
  ok(Number((await admin.rpc("coin_bonus_pct", { p_user: m.id })).data) === 0, "Nhà đổ nát: thú cưng mất buff");
  await resetDay();
  ok((await admin.rpc("_attack", { p_attacker: u.id, p_defender: m.id, p_rand: 1 })).error?.message === "TARGET_RUINED", "Không đánh nhà đã đổ nát");
  // sửa lại bằng xu
  await admin.rpc("apply_coins", { p_user: m.id, p_amount: 1000, p_reason: "LEVEL_WIN" });
  const before = await coins(m.id);
  ok((await m.c.rpc("repair_house", { p_hp: 100 })).data === 100 && await coins(m.id) === before - 200, "Người bị đập nhà dùng xu sửa (2 xu/HP)");
  const ledger = (await admin.from("coin_transactions").select("amount").eq("user_id", u.id)).data!.reduce((a: number, t: any) => a + t.amount, 0);
  ok(ledger === await coins(u.id), "ECO-01 sổ cái khớp số dư");
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
