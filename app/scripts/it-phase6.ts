/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp Phase 6 + 9 – tấn công mô phỏng, phòng thủ, bẫy & khiên (BTL-*, BASE-10..12)
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame, coins } from "./it-lib";
import { beginBattle, finishBattle } from "../src/lib/attack-core";

async function main() {
  await resetGame();
  const m = await moheoLogin(); const u = await utdacLogin();   // m = người phòng thủ, u = người tấn công
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const err = async (p: PromiseLike<{ error: any }>) => (await p).error?.message;
  const hp = async (id: string) => (await admin.from("user_house").select("hp").eq("user_id", id).single()).data!.hp as number;
  // luật mới: lính ngã là mất → nạp lại 10 Lính kiếm cho người đánh trước mỗi trận thử tiếp theo
  const refill = async () => { await admin.from("user_army").update({ quantity: 10 }).eq("user_id", u.id).eq("unit_code", "sword"); };
  const resetDay = async () => { await refill(); await admin.from("daily_counters").update({ attacks_used: 0 }).eq("user_id", u.id); await admin.from("attacks").update({ created_at: new Date(Date.now() - 3 * 3600000).toISOString() }).eq("defender_id", m.id); };

  // dữ liệu ví dụ sheet 2 mục G: 10 Lính kiếm đánh nhà cấp 1 (HP 500, DEF 20), không phòng thủ
  await admin.from("user_army").insert([{ user_id: u.id, unit_code: "sword", quantity: 10 }]);
  await admin.from("user_house").update({ level: 1, hp: 500, max_hp: 500 }).eq("user_id", m.id);
  const two = [{ t: 0, unit: "sword", n: 5, x: 6, z: -1 }, { t: 0, unit: "sword", n: 5, x: -8, z: -1 }];   // nhà 3×3 ô có tâm (−1; −1) m → cách tâm 7 m hai phía
  const begin = () => beginBattle(admin, u.id, m.id);
  const fight = async (deploys: unknown = two, endTick: number | null = null) => { const b = await begin(); if (b.status !== 200) return b; return finishBattle(admin, u.id, { id: b.body.id as string, deploys, endTick }); };
  ok((await u.c.rpc("attack", { p_defender: m.id })).error !== null, "RPC attack bản cũ không còn cho người chơi gọi (né tháp/bẫy)");
  ok((await u.c.rpc("_attack_begin", { p_attacker: u.id, p_defender: m.id, p_snapshot: {}, p_atk: 0, p_def: 0 })).error !== null && (await u.c.rpc("_attack_finish", { p_id: u.id, p_attacker: u.id, p_damage: 9999, p_deploys: [], p_stats: {} })).error !== null, "BTL-08 người chơi không gọi thẳng được _attack_begin / _attack_finish");

  // ---- khiên của người phòng thủ chặn tấn công ----
  ok(await err(m.c.rpc("activate_shield")) === undefined, "BTL-04 bật khiên miễn phí");
  ok(await err(m.c.rpc("activate_shield")) === "SHIELD_ACTIVE", "Không bật khiên khi đang có khiên");
  const blk = await begin();
  ok(blk.status === 200 && blk.body.blocked === true, "TC-24/TC-63 đối thủ có khiên (bí mật) → khiên chặn, không có trận", blk.body);
  ok(((await admin.from("user_army").select("quantity").eq("user_id", u.id).single()).data!.quantity) === 0, "Khiên tiêu diệt toàn bộ 10 lính mang đi");
  ok(await hp(m.id) === 500, "HP không đổi khi bị chặn");
  await refill();
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

  // ---- trận đánh mô phỏng (TC-26, TC-36) ----
  await admin.from("shields").delete().eq("user_id", m.id);
  const u0 = await coins(u.id), m1 = await coins(m.id);
  const b1 = await begin();
  ok(b1.status === 200 && (b1.body.snapshot as any).house.hp === 500 && (b1.body.snapshot as any).army[0].qty === 10, "BTL-07 bắt đầu trận: có ảnh chụp, HP nhà 500, 10 lính", b1);
  ok((await admin.from("daily_counters").select("attacks_used").eq("user_id", u.id).single()).data!.attacks_used === 2 && await hp(m.id) === 500, "Bấm Tấn công là trừ lượt (lần bị khiên chặn cũng tính); HP chưa đổi");
  const fake = await finishBattle(admin, u.id, { id: b1.body.id as string, deploys: [{ t: 0, unit: "sword", n: 999, x: 15, z: 0 }], endTick: null });
  ok(fake.status === 400 && fake.body.error === "INVALID_LOG" && await hp(m.id) === 500, "TC-36 nhật ký giả (999 lính) → 400, HP không đổi", fake);
  const close = await finishBattle(admin, u.id, { id: b1.body.id as string, deploys: [{ t: 0, unit: "sword", n: 5, x: 4, z: -1 }], endTick: null });
  ok(close.status === 400 && close.body.detail === "TOO_CLOSE", "TC-35 thả trong vùng cấm → từ chối", close);
  ok((await finishBattle(admin, m.id, { id: b1.body.id as string, deploys: two, endTick: null })).status === 404, "Người khác không kết thúc trận của mình được");
  const r = await finishBattle(admin, u.id, { id: b1.body.id as string, deploys: two, endTick: null });
  ok(r.status === 200 && r.body.damage === 111 && r.body.loot === 56 && r.body.hp_after === 389, "TC-26 ví dụ sheet 2: sát thương 111, loot 56, HP còn 389", r);
  ok(await hp(m.id) === 389, "HP nhà người bị đánh giảm");
  ok(await coins(u.id) === u0 + 56 && await coins(m.id) === m1, "Người đánh +56 xu; người bị đánh KHÔNG bị trừ xu");
  ok((await finishBattle(admin, u.id, { id: b1.body.id as string, deploys: two, endTick: null })).status === 409 && await coins(u.id) === u0 + 56, "Gửi kết thúc lần 2 → 409, không cộng xu lần nữa");
  ok((await admin.from("notifications").select("id").eq("user_id", m.id).eq("type", "ATTACKED")).data!.length === 1, "BTL-05 thông báo bị tấn công");
  const row = (await m.c.from("attacks").select("status,deploys,snapshot,stats,hp_before").neq("status", "BLOCKED")).data!;
  ok(row.length === 1 && (await u.c.from("attacks").select("id").neq("status", "BLOCKED")).data!.length === 1 && row[0].status === "DONE" && row[0].deploys.list.length === 2 && row[0].hp_before === 500, "Nhật ký trận: cả 2 bên thấy, có nhật ký rải quân để xem lại", row);
  ok((await begin()).body.error === "TARGET_PROTECTED", "Bảo hộ 1 giờ sau khi bị đánh");

  // ---- lượt thứ 2: có tháp canh + bẫy + đội gác ----
  await admin.from("attacks").update({ created_at: new Date(Date.now() - 2 * 3600000).toISOString() }).eq("defender_id", m.id);
  await admin.rpc("apply_coins", { p_user: m.id, p_amount: 2000, p_reason: "LEVEL_WIN" });
  const tw = await m.c.rpc("buy_defense", { p_code: "def_tower" });
  ok(!tw.error && await err(m.c.rpc("buy_defense", { p_code: "def_tower" })) === "DEFENSE_LIMIT", "TC-33 nhà cấp 1: chỉ 1 Tháp canh, cái thứ 2 bị chặn", tw.error);
  ok(await err(m.c.rpc("buy_defense", { p_code: "def_cannon" })) === "ITEM_LOCKED", "Xe pháo khoá tới khi màn 3 đóng");
  const tr = await m.c.rpc("buy_defense", { p_code: "trap_spike" });
  await admin.from("user_army").insert({ user_id: m.id, unit_code: "sword", quantity: 5 });
  // lưới 40: nhà cấp 1 = 3×3 ô ở (18..20), tâm (−1, −1) m; tháp 2×2 ở (9,12) = tâm (0, 6) m; bẫy ở (12,9) = tâm (5, −1) m; đội gác ở (5,9)
  const lay = await m.c.rpc("save_base_layout", { p_items: [{ kind: "DEFENSE", ref: tw.data, x: 19, z: 22 }, { kind: "TRAP", ref: tr.data, x: 22, z: 19 }, { kind: "UNIT", ref: "sword", x: 15, z: 19 }] });
  ok(!lay.error && lay.data === 3, "BASE-10/11 đặt tháp + bẫy + đội gác lên lưới", lay.error);
  ok(await err(m.c.rpc("save_base_layout", { p_items: [{ kind: "TRAP", ref: tw.data, x: 10, z: 10 }] })) === "ITEM_NOT_OWNED", "Không khai tháp thành bẫy");
  const seenD = (await u.c.from("user_defenses").select("kind").eq("user_id", m.id)).data!, seenL = (await u.c.from("base_layout").select("kind").eq("user_id", m.id)).data!;
  ok(seenD.length === 1 && seenD[0].kind === "DEFENSE" && seenL.length === 2 && !seenL.some((x: any) => x.kind === "TRAP"), "TC-34 người ấy do thám: thấy tháp, KHÔNG thấy bẫy", { seenD, seenL });
  ok((await m.c.from("base_layout").select("kind").eq("user_id", m.id)).data!.length === 3, "Chủ nhà thấy đủ bố cục của mình");
  const hpBefore = await hp(m.id);
  const b2 = await begin(); const snap2 = b2.body.snapshot as any;
  ok(b2.status === 200 && snap2.defenses.length === 1 && snap2.traps.length === 1 && snap2.guards.length === 1 && snap2.defenses[0].x === 0 && snap2.defenses[0].z === 6 && snap2.defenses[0].hp === 960,
    "Ảnh chụp trận có tháp (HP ×1,2 theo cấp nhà), bẫy, đội gác đúng vị trí", snap2);
  const r2 = await finishBattle(admin, u.id, { id: b2.body.id as string, deploys: two, endTick: null });
  ok(r2.status === 200 && (r2.body.damage as number) < 111 && r2.body.hp_after === hpBefore - (r2.body.damage as number) && (r2.body.out as any).trapsHit === 1 && (r2.body.out as any).lost.sword > 0,
    "Lượt 2: có phòng thủ → sát thương thấp hơn, bẫy nổ, lính ngã", r2.body);
  const lost2 = (r2.body.out as any).lost.sword as number, gl2 = ((r2.body.out as any).guardsLost?.sword ?? 0) as number;
  ok((await admin.from("user_army").select("quantity").eq("user_id", u.id).single()).data!.quantity === 10 - lost2, `TC-61 lính ngã là mất: người đánh còn ${10 - lost2}/10 Lính kiếm`);
  ok(((await admin.from("user_army").select("quantity").eq("user_id", m.id).maybeSingle()).data?.quantity ?? 0) === 5 - gl2, `Lính gác ngã ${gl2} → người bị đánh còn ${5 - gl2}`);
  await refill();
  await admin.from("attacks").update({ created_at: new Date(Date.now() - 2 * 3600000).toISOString() }).eq("defender_id", m.id);
  const b3x = await begin();
  ok(b3x.status === 200, "TC-27 không giới hạn lượt: lần thứ 3 trong ngày vẫn đánh được (ATTACKS_PER_DAY = 0)", b3x.body);
  if (b3x.status === 200) await finishBattle(admin, u.id, { id: b3x.body.id as string, deploys: [], endTick: 0 });
  await admin.from("attacks").update({ created_at: new Date(Date.now() - 2 * 3600000).toISOString() }).eq("defender_id", m.id);
  ok((await beginBattle(admin, u.id, u.id)).body.error === "INVALID_TARGET", "Không tự đánh mình");
  await admin.from("user_army").delete().eq("user_id", m.id);
  ok((await beginBattle(admin, m.id, u.id)).body.error === "NO_ARMY", "Không có lính không đánh được");

  // ---- bỏ dở trận (TC-37) ----
  await resetDay();
  const b3 = await begin(); const c3 = await coins(u.id), h3 = await hp(m.id);
  await admin.from("attacks").update({ created_at: new Date(Date.now() - 11 * 60000).toISOString() }).eq("id", b3.body.id as string);
  const late = await finishBattle(admin, u.id, { id: b3.body.id as string, deploys: two, endTick: null });
  ok(late.status === 200 && late.body.expired === true && late.body.damage === 0 && await hp(m.id) === h3 && await coins(u.id) === c3, "TC-37 kết thúc quá hạn → 0 sát thương, không xu", late);
  await admin.from("attacks").update({ created_at: new Date(Date.now() - 3 * 3600000).toISOString() }).eq("defender_id", m.id);
  const b4 = await begin();
  await admin.from("attacks").update({ created_at: new Date(Date.now() - 11 * 60000).toISOString() }).eq("id", b4.body.id as string);
  await u.c.rpc("cron_tick");
  ok((await admin.from("attacks").select("status").eq("id", b4.body.id as string).single()).data!.status === "EXPIRED" && (await admin.from("daily_counters").select("attacks_used").eq("user_id", u.id).single()).data!.attacks_used === 2, "cron_tick đóng trận bỏ dở; lượt vẫn bị trừ");

  // ---- đi đánh khi đang có khiên → khiên vỡ ----
  await resetDay();
  ok(await err(u.c.rpc("activate_shield")) === undefined, "Út đặc bật khiên");
  const r3 = await fight();
  ok(r3.body.shield_broken === true && !(await admin.rpc("has_active_shield", { p_user: u.id })).data, "TC-25 đánh khi có khiên → khiên vỡ", r3);

  // ---- nhà đổ nát ----
  await resetDay();
  await admin.from("base_layout").delete().eq("user_id", m.id); await admin.from("user_defenses").delete().eq("user_id", m.id);
  await admin.from("user_house").update({ hp: 1 }).eq("user_id", m.id);
  const r4 = await fight();
  ok(r4.body.damage === 1 && r4.body.ruined === true && await hp(m.id) === 0, "Sát thương không vượt HP; nhà đổ nát (HP=0)", r4);
  ok(Number((await admin.rpc("coin_bonus_pct", { p_user: m.id })).data) === 0, "Nhà đổ nát: thú cưng mất buff");
  await resetDay();
  ok((await begin()).body.error === "TARGET_RUINED", "Không đánh nhà đã đổ nát");
  // sửa lại bằng xu
  await admin.rpc("apply_coins", { p_user: m.id, p_amount: 1000, p_reason: "LEVEL_WIN" });
  const before = await coins(m.id);
  ok((await m.c.rpc("repair_house", { p_hp: 100 })).data === 100 && await coins(m.id) === before - 200, "Người bị đập nhà dùng xu sửa (2 xu/HP)");
  const ledger = (await admin.from("coin_transactions").select("amount").eq("user_id", u.id)).data!.reduce((a: number, t: any) => a + t.amount, 0);
  ok(ledger === await coins(u.id), "ECO-01 sổ cái khớp số dư");
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
