/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp căn cứ 3D kiểu Clash of Clans (BASE-07..09): đồ trang trí + bố cục trên lưới
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame, coins } from "./it-lib";

async function main() {
  await resetGame();
  const m = await moheoLogin(); const u = await utdacLogin();
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const err = async (p: PromiseLike<{ error: any }>) => (await p).error?.message;
  await admin.rpc("apply_coins", { p_user: m.id, p_amount: 5000, p_reason: "LEVEL_WIN" });

  // ---- đồ trang trí (BASE-09) ----
  const c0 = await coins(m.id);
  const fence = await m.c.rpc("buy_decor", { p_code: "deco_fence" });
  ok(!fence.error && await coins(m.id) === c0 - 15, "Mua Hàng rào gỗ −15 xu", fence.error);
  const tx = (await admin.from("coin_transactions").select("amount,reason,ref_id").eq("user_id", m.id).order("id", { ascending: false }).limit(1)).data![0];
  ok(tx.amount === -15 && tx.reason === "PURCHASE" && tx.ref_id === "deco_fence", "Ghi sổ cái coin_transactions", tx);
  ok(await err(m.c.rpc("buy_decor", { p_code: "deco_windmill" })) === "ITEM_LOCKED", "Cối xay gió khoá tới khi màn 4 đóng");
  ok(await err(m.c.rpc("buy_decor", { p_code: "cat" })) === "ITEM_NOT_FOUND", "buy_decor không mua được thú cưng");
  await admin.from("shop_items").update({ stats: { size: 1, model: "bush", desc: "", max: 2 } }).eq("code", "deco_bush");
  await m.c.rpc("buy_decor", { p_code: "deco_bush" }); await m.c.rpc("buy_decor", { p_code: "deco_bush" });
  ok(await err(m.c.rpc("buy_decor", { p_code: "deco_bush" })) === "DECOR_LIMIT", "Vượt giới hạn số món/loại → chặn");
  await admin.from("shop_items").update({ stats: { size: 1, model: "bush", desc: "Bụi hoa nhỏ xinh", max: 20 } }).eq("code", "deco_bush");
  const poor = await coins(m.id);
  await admin.rpc("apply_coins", { p_user: m.id, p_amount: -poor + 5, p_reason: "PURCHASE" });
  ok(await err(m.c.rpc("buy_decor", { p_code: "deco_lamp" })) === "NOT_ENOUGH_COINS", "Không đủ xu → chặn, không trừ");
  ok(await coins(m.id) === 5, "Xu giữ nguyên khi mua thất bại");
  await admin.rpc("apply_coins", { p_user: m.id, p_amount: 5000, p_reason: "LEVEL_WIN" });

  // ---- sở hữu: quân, thú cưng, vũ khí ----
  await m.c.rpc("buy_unit", { p_code: "sword", p_qty: 3 });
  const pet = (await m.c.rpc("buy_pet", { p_code: "cat" })).data as string;
  const tent = (await m.c.rpc("buy_decor", { p_code: "deco_tent" }));   // khoá màn 2
  ok(tent.error?.message === "ITEM_LOCKED", "Lều trại khoá tới khi màn 2 đóng");
  const { data: decors } = await m.c.from("user_decor").select("id,code").eq("user_id", m.id);
  const fenceId = decors!.find((d: any) => d.code === "deco_fence")!.id;
  const army = (await m.c.from("user_army").select("unit_code,quantity").eq("user_id", m.id)).data;
  ok(army?.some((a: any) => a.unit_code === "sword" && a.quantity === 3) ?? false, "Có 3 lính kiếm", army);

  // ---- bố cục (BASE-07) ----  nhà cấp 0 = 2×2 ở giữa lưới 20 → ô (9..10)
  const save = (items: any[]) => m.c.rpc("save_base_layout", { p_items: items });
  const good = [
    { kind: "UNIT", ref: "sword", x: 2, z: 2, rot: 0 },
    { kind: "PET", ref: pet, x: 12, z: 9, rot: 1 },
    { kind: "DECOR", ref: fenceId, x: 0, z: 19, rot: 3 },
  ];
  const r1 = await save(good);
  ok(r1.data === 3, "Lưu bố cục hợp lệ (3 vật)", r1.error);
  const rows = (await m.c.from("base_layout").select("kind,ref,x,z,rot").eq("user_id", m.id)).data!;
  ok(rows.length === 3 && rows.some((r: any) => r.kind === "PET" && r.x === 12 && r.rot === 1), "Đọc lại đúng vị trí", rows);
  ok(await err(save([{ kind: "UNIT", ref: "sword", x: 19, z: 0 }])) === "OUT_OF_BOUNDS", "Đội quân 2×2 ở ô 19 → ra ngoài lưới");
  ok(await err(save([{ kind: "UNIT", ref: "sword", x: 8, z: 8 }])) === "OVERLAP_HOUSE", "Đè lên nhà → chặn");
  ok(await err(save([{ kind: "UNIT", ref: "sword", x: 2, z: 2 }, { kind: "PET", ref: pet, x: 3, z: 3 }])) === "OVERLAP", "Đè lên nhau → chặn");
  ok(await err(save([{ kind: "UNIT", ref: "archer", x: 0, z: 0 }])) === "ITEM_NOT_OWNED", "Đặt loại lính chưa có → chặn");
  ok(await err(save([{ kind: "UNIT", ref: "sword", x: 0, z: 0 }, { kind: "UNIT", ref: "sword", x: 5, z: 5 }])) === "DUPLICATE_ITEM", "Đặt trùng 1 vật 2 lần → chặn");
  ok(await err(save([{ kind: "BOSS", ref: "x", x: 0, z: 0 }])) === "INVALID_LAYOUT", "Loại vật lạ → chặn");
  const uPet = (await u.c.rpc("buy_pet", { p_code: "corgi" })).data;
  ok(await err(save([{ kind: "PET", ref: uPet, x: 0, z: 0 }])) === "ITEM_NOT_OWNED", "Không đặt được thú cưng của người khác");
  ok((await m.c.from("base_layout").select("ref").eq("user_id", m.id)).data!.length === 3, "Lưu thất bại không làm mất bố cục cũ");

  // người ấy xem được bố cục (để thấy khi tấn công), nhưng không sửa trực tiếp được
  ok(((await u.c.from("base_layout").select("ref").eq("user_id", m.id)).data ?? []).length === 3, "Người ấy đọc được bố cục của mình");
  const hack = await u.c.from("base_layout").insert({ user_id: m.id, kind: "UNIT", ref: "sword", x: 0, z: 0 });
  ok(!!hack.error, "Không ghi thẳng vào base_layout được (RLS)");
  const hack2 = await u.c.from("user_decor").insert({ user_id: u.id, code: "deco_tower" });
  ok(!!hack2.error, "Không tự thêm đồ trang trí miễn phí được (RLS)");

  // ---- nhà lên cấp to ra → vật bị đè về kho ----
  ok(!(await save([{ kind: "UNIT", ref: "sword", x: 2, z: 2 }, { kind: "PET", ref: pet, x: 11, z: 9 }])).error, "Thú cưng sát nhà cấp 0");
  await admin.from("user_house").update({ level: 1 }).eq("user_id", m.id);   // 3×3 → ô 8..10 đè lên x=11? không; nhà 3×3: h0 = 8 → 8..10
  let lay = (await m.c.from("base_layout").select("kind,ref").eq("user_id", m.id)).data!;
  ok(lay.some((l: any) => l.kind === "PET"), "Nhà 3×3 chưa đè thú cưng ở ô 11 → giữ nguyên");
  await admin.from("user_house").update({ level: 3 }).eq("user_id", m.id);   // 4×4: h0 = 8 → 8..11 đè ô 11
  lay = (await m.c.from("base_layout").select("kind,ref").eq("user_id", m.id)).data!;
  ok(!lay.some((l: any) => l.kind === "PET") && lay.some((l: any) => l.kind === "UNIT"), "Nhà 4×4 đè thú cưng → thú cưng về kho, đội quân giữ nguyên", lay);

  // ---- reset mùa xoá bố cục + đồ trang trí ----
  await admin.from("profiles").update({ role: "ADMIN" }).eq("id", u.id);
  const rs = await u.c.rpc("admin_reset_season", { p_confirm: "RESET" });
  ok(!rs.error, "Reset mùa giải chạy được", rs.error);
  ok(((await admin.from("base_layout").select("ref")).data ?? []).length === 0 && ((await admin.from("user_decor").select("id")).data ?? []).length === 0, "Reset mùa xoá bố cục và đồ trang trí");
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
