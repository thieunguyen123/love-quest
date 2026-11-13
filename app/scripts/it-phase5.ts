/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp Phase 5 – kinh tế, shop, căn cứ (ECO-*, BASE-*)
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame, coins } from "./it-lib";

async function main() {
  await resetGame();
  const m = await moheoLogin(); const u = await utdacLogin();
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const fund = (id: string, n: number) => admin.rpc("apply_coins", { p_user: id, p_amount: n, p_reason: "LEVEL_WIN" });
  const give = (id: string, t: string, n = 1) => admin.rpc("grant_item", { p_user: id, p_type: t, p_qty: n });
  const err = async (p: PromiseLike<{ error: any }>) => (await p).error?.message;
  const tokens = async (t: string) => (await admin.from("inventory").select("quantity").eq("user_id", m.id).eq("item_type", t).maybeSingle()).data?.quantity ?? 0;

  // ---- ví ----
  ok(await coins(m.id) === 500, "Xu khởi đầu 500");
  // không đủ xu
  await admin.rpc("apply_coins", { p_user: m.id, p_amount: -400, p_reason: "PURCHASE" });
  ok(await err(m.c.rpc("buy_pet", { p_code: "owl" })) === "NOT_ENOUGH_COINS", "TC-20 không đủ xu → bị chặn ở server");
  ok(await coins(m.id) === 100, "Xu không đổi khi mua thất bại");
  await fund(m.id, 5000);
  const base = await coins(m.id);

  // ---- thú cưng ----
  const cat = await m.c.rpc("buy_pet", { p_code: "cat" });
  ok(!cat.error && await coins(m.id) === base - 200, "Mua Mèo mướp -200 xu", cat.error);
  ok(await err(m.c.rpc("buy_pet", { p_code: "cat" })) === "ALREADY_OWNED", "Mỗi loài 1 con");
  ok(await err(m.c.rpc("buy_pet", { p_code: "dragon" })) === "ITEM_LOCKED", "Rồng con khóa tới khi màn 5 đóng");
  ok(await err(m.c.rpc("rename_pet", { p_id: cat.data, p_name: "Miu Miu" })) === undefined, "Đặt tên thú cưng");
  ok(await err(m.c.rpc("upgrade_pet", { p_id: cat.data })) === "NOT_ENOUGH_ITEM", "Nâng cấp thú cưng cần token");
  await give(m.id, "PET_UPGRADE", 5);
  const c1 = await coins(m.id);
  const up = await m.c.rpc("upgrade_pet", { p_id: cat.data });
  ok(up.data === 2 && await coins(m.id) === c1 - 100 && await tokens("PET_UPGRADE") === 4, "Cấp 1→2: -100 xu, -1 token", up);
  for (let i = 0; i < 3; i++) await m.c.rpc("upgrade_pet", { p_id: cat.data });
  ok(await err(m.c.rpc("upgrade_pet", { p_id: cat.data })) === "MAX_LEVEL", "Tối đa cấp 5");
  ok(Number((await admin.rpc("coin_bonus_pct", { p_user: m.id })).data) === 0.15, "Buff Mèo cấp 5 = +15% xu màn");
  await admin.from("user_house").update({ hp: 0 }).eq("user_id", m.id);
  ok(Number((await admin.rpc("coin_bonus_pct", { p_user: m.id })).data) === 0, "BASE-03 nhà đổ nát → mất buff");
  await admin.from("user_house").update({ hp: 200 }).eq("user_id", m.id);

  // ---- quân đội + sức chứa ----
  ok((await m.c.rpc("buy_unit", { p_code: "sword", p_qty: 10 })).data === 10, "Mua 10 Lính kiếm (đủ 10 chỗ nhà cấp 0)");
  ok(await err(m.c.rpc("buy_unit", { p_code: "sword", p_qty: 1 })) === "ARMY_FULL", "TC-23 hết chỗ chứa quân");
  ok(await err(m.c.rpc("buy_unit", { p_code: "archer", p_qty: 1 })) === "ITEM_LOCKED", "Cung thủ khóa tới khi màn 3 đóng");

  // ---- nhà ----
  await admin.from("user_house").update({ hp: 150 }).eq("user_id", m.id);
  ok(await err(m.c.rpc("upgrade_house")) === "HOUSE_DAMAGED", "TC-22 nhà thiếu HP không nâng cấp được");
  const c2 = await coins(m.id);
  const rep = await m.c.rpc("repair_house", { p_hp: 50 });
  ok(rep.data === 200 && await coins(m.id) === c2 - 100, "BASE-06 sửa 50 HP = 100 xu (2 xu/HP)", rep);
  ok(await err(m.c.rpc("repair_house", { p_hp: 1 })) === "INVALID_HP", "Không sửa quá HP tối đa");
  const c3 = await coins(m.id);
  const hu = await m.c.rpc("upgrade_house");
  const h = (await admin.from("user_house").select("*").eq("user_id", m.id).single()).data!;
  ok(hu.data === 1 && h.max_hp === 500 && h.hp === 500 && await coins(m.id) === c3 - 300, "BASE-02 Nhà gỗ: -300 xu, HP 500", { hu, h });
  ok((await admin.rpc("army_capacity", { p_user: m.id })).data === 20, "Sức chứa quân nhà cấp 1 = 20");
  ok((await m.c.rpc("buy_unit", { p_code: "sword", p_qty: 10 })).data === 20, "Giờ mua thêm được 10 lính");

  // ---- cấp quân đội ----
  ok(await err(m.c.rpc("upgrade_army")) === "NOT_ENOUGH_ITEM", "Nâng cấp quân cần token");
  await give(m.id, "ARMY_UPGRADE", 1);
  const c4 = await coins(m.id);
  ok((await m.c.rpc("upgrade_army")).data === 1 && await coins(m.id) === c4 - 150, "Quân cấp 1: -150 xu");

  // ---- vũ khí ----
  ok(await err(m.c.rpc("buy_weapon", { p_code: "iron_sword" })) === "NOT_ENOUGH_ITEM", "TC-21 vũ khí cần Quyền mua vũ khí");
  await give(m.id, "WEAPON_LICENSE", 3);
  ok(await err(m.c.rpc("buy_weapon", { p_code: "iron_sword" })) === undefined, "Mua Kiếm sắt");
  ok(await err(m.c.rpc("buy_weapon", { p_code: "iron_sword" })) === "ALREADY_OWNED", "Mỗi vũ khí 1 lần");
  ok(await err(m.c.rpc("buy_weapon", { p_code: "fire_bow" })) === "ITEM_LOCKED", "Cung lửa khóa tới khi màn 4 đóng");
  await admin.from("levels").update({ status: "CLOSED" }).eq("order_no", 4);
  ok(await err(m.c.rpc("buy_weapon", { p_code: "fire_bow" })) === undefined, "Màn 4 đóng → mua được Cung lửa");
  ok(await tokens("WEAPON_LICENSE") === 1, "Token vũ khí còn 1");

  // ---- người ấy xem được căn cứ nhưng không sửa được ----
  const { data: seen } = await u.c.from("user_pets").select("pet_code").eq("user_id", m.id);
  ok(seen!.length === 1, "Người ấy xem được thú cưng của mình");
  const hack = await u.c.from("user_pets").update({ nickname: "hack" }).eq("user_id", m.id).select();
  ok(!hack.data?.length, "Người ấy không sửa được thú cưng của mình (RLS)", hack.data);
  const direct = await u.c.from("user_army").insert({ user_id: u.id, unit_code: "sword", quantity: 99 });
  ok(direct.error !== null, "Không tự ghi quân qua API trực tiếp (RLS)", direct.error?.message);
  const ledger = (await admin.from("coin_transactions").select("amount").eq("user_id", m.id)).data!.reduce((a: number, t: any) => a + t.amount, 0);
  ok(ledger === await coins(m.id), "ECO-01 tổng sổ cái = số dư", { ledger, bal: await coins(m.id) });
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
