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
  await admin.from("user_army").insert({ user_id: m.id, unit_code: "sword", quantity: 3 });   // lính giờ luyện ở nhà máy (test ở phase 5)
  const pet = (await m.c.rpc("buy_pet", { p_code: "cat" })).data as string;
  const tent = (await m.c.rpc("buy_decor", { p_code: "deco_tent" }));   // khoá màn 2
  ok(tent.error?.message === "ITEM_LOCKED", "Lều trại khoá tới khi màn 2 đóng");
  const { data: decors } = await m.c.from("user_decor").select("id,code").eq("user_id", m.id);
  const fenceId = decors!.find((d: any) => d.code === "deco_fence")!.id;
  const army = (await m.c.from("user_army").select("unit_code,quantity").eq("user_id", m.id)).data;
  ok(army?.some((a: any) => a.unit_code === "sword" && a.quantity === 3) ?? false, "Có 3 lính kiếm", army);

  // ---- bố cục (BASE-07) ----  lưới 40, nhà cấp 0 = 2×2 ở giữa → ô (19..20); vùng trống không vật cản: ô 8..31
  const save = (items: any[]) => m.c.rpc("save_base_layout", { p_items: items });
  const good = [
    { kind: "UNIT", ref: "sword", x: 12, z: 12, rot: 0 },
    { kind: "PET", ref: pet, x: 22, z: 19, rot: 1 },
    { kind: "DECOR", ref: fenceId, x: 10, z: 29, rot: 3 },
  ];
  const r1 = await save(good);
  ok(r1.data === 3, "Lưu bố cục hợp lệ (3 vật)", r1.error);
  const rows = (await m.c.from("base_layout").select("kind,ref,x,z,rot").eq("user_id", m.id)).data!;
  ok(rows.length === 3 && rows.some((r: any) => r.kind === "PET" && r.x === 22 && r.rot === 1), "Đọc lại đúng vị trí", rows);
  ok(await err(save([{ kind: "UNIT", ref: "sword", x: 39, z: 15 }])) === "OUT_OF_BOUNDS", "Đội quân 2×2 ở ô 39 → ra ngoài lưới 40");
  ok(await err(save([{ kind: "UNIT", ref: "sword", x: 18, z: 18 }])) === "OVERLAP_HOUSE", "Đè lên nhà → chặn");
  ok(await err(save([{ kind: "UNIT", ref: "sword", x: 12, z: 12 }, { kind: "PET", ref: pet, x: 13, z: 13 }])) === "OVERLAP", "Đè lên nhau → chặn");
  ok(await err(save([{ kind: "UNIT", ref: "archer", x: 10, z: 10 }])) === "ITEM_NOT_OWNED", "Đặt loại lính chưa có → chặn");
  ok(await err(save([{ kind: "UNIT", ref: "sword", x: 10, z: 10 }, { kind: "UNIT", ref: "sword", x: 15, z: 15 }])) === "DUPLICATE_ITEM", "Đặt trùng 1 vật 2 lần → chặn");
  ok(await err(save([{ kind: "BOSS", ref: "x", x: 10, z: 10 }])) === "INVALID_LAYOUT", "Loại vật lạ → chặn");
  const uPet = (await u.c.rpc("buy_pet", { p_code: "corgi" })).data;
  ok(await err(save([{ kind: "PET", ref: uPet, x: 10, z: 10 }])) === "ITEM_NOT_OWNED", "Không đặt được thú cưng của người khác");
  ok((await m.c.from("base_layout").select("ref").eq("user_id", m.id)).data!.length === 3, "Lưu thất bại không làm mất bố cục cũ");

  // người ấy xem được bố cục (để thấy khi tấn công), nhưng không sửa trực tiếp được
  ok(((await u.c.from("base_layout").select("ref").eq("user_id", m.id)).data ?? []).length === 3, "Người ấy đọc được bố cục của mình");
  const hack = await u.c.from("base_layout").insert({ user_id: m.id, kind: "UNIT", ref: "sword", x: 10, z: 10 });
  ok(!!hack.error, "Không ghi thẳng vào base_layout được (RLS)");
  const hack2 = await u.c.from("user_decor").insert({ user_id: u.id, code: "deco_tower" });
  ok(!!hack2.error, "Không tự thêm đồ trang trí miễn phí được (RLS)");

  // ---- nhà lên cấp to ra → vật bị đè về kho ----
  ok(!(await save([{ kind: "UNIT", ref: "sword", x: 12, z: 12 }, { kind: "PET", ref: pet, x: 21, z: 19 }])).error, "Thú cưng sát nhà cấp 0");
  await admin.from("user_house").update({ level: 1 }).eq("user_id", m.id);   // nhà 3×3: h0 = 18 → 18..20, chưa đè ô 21
  let lay = (await m.c.from("base_layout").select("kind,ref").eq("user_id", m.id)).data!;
  ok(lay.some((l: any) => l.kind === "PET"), "Nhà 3×3 chưa đè thú cưng ở ô 21 → giữ nguyên");
  await admin.from("user_house").update({ level: 3 }).eq("user_id", m.id);   // 4×4: h0 = 18 → 18..21 đè ô 21
  lay = (await m.c.from("base_layout").select("kind,ref").eq("user_id", m.id)).data!;
  ok(!lay.some((l: any) => l.kind === "PET") && lay.some((l: any) => l.kind === "UNIT"), "Nhà 4×4 đè thú cưng → thú cưng về kho, đội quân giữ nguyên", lay);

  // ---- vật cản & mở rộng căn cứ (BASE-13) ----
  const { data: obs } = await m.c.from("obstacles").select("*").order("id");
  ok((obs ?? []).length > 40, "Có vật cản vòng ngoài", obs?.length);
  const tree = obs!.find((o: any) => o.size === 2)!;
  ok(await err(save([{ kind: "UNIT", ref: "sword", x: tree.x, z: tree.z }])) === "OVERLAP_OBSTACLE", "TC-41 không đặt đè vật cản chưa dọn");
  await admin.from("user_house").update({ level: 0 }).eq("user_id", m.id);
  const cObs = await coins(m.id);
  const cl = await m.c.rpc("clear_obstacle", { p_id: tree.id });
  ok(!cl.error && cl.data === 600 && await coins(m.id) === cObs - 600, "TC-40 dọn lùm cây 2×2: -600 xu", cl.error);
  ok(await err(m.c.rpc("clear_obstacle", { p_id: tree.id })) === "ALREADY_CLEARED", "Không dọn 1 vật cản 2 lần");
  ok(!(await save([{ kind: "UNIT", ref: "sword", x: tree.x, z: tree.z }])).error, "Dọn xong → đặt được đồ vào chỗ đó");
  ok(((await u.c.from("base_clear").select("obstacle_id").eq("user_id", m.id)).data ?? []).length === 1, "Người ấy thấy vật cản đã dọn (để xem căn cứ đúng)");
  ok(!!(await u.c.from("base_clear").insert({ user_id: u.id, obstacle_id: obs![1].id })).error, "Không tự dọn miễn phí được (RLS)");

  // ---- tường thành (BASE-15) ----
  await admin.from("user_house").update({ level: 0 }).eq("user_id", m.id);
  const cW = await coins(m.id);
  ok((await m.c.rpc("buy_walls", { p_qty: 20 })).data === 20 && await coins(m.id) === cW - 800, "Mua 20 đoạn tường: -800 xu");
  ok(await err(m.c.rpc("buy_walls", { p_qty: 1 })) === "DEFENSE_LIMIT", "TC-48 nhà cấp 0 tối đa 20 đoạn tường");
  const wIds = ((await m.c.from("user_defenses").select("id").eq("user_id", m.id).eq("kind", "WALL")).data ?? []).map((w: any) => w.id);
  const wallRow = wIds.slice(0, 6).map((id: string, i: number) => ({ kind: "WALL", ref: id, x: 16 + i, z: 16 }));
  ok(!(await save([{ kind: "UNIT", ref: "sword", x: tree.x, z: tree.z }, ...wallRow])).error, "Xây 6 đoạn tường liền nhau");
  ok(await err(save([{ kind: "WALL", ref: wIds[0], x: 16, z: 16 }, { kind: "WALL", ref: wIds[1], x: 16, z: 16 }])) === "OVERLAP", "Không xây 2 đoạn tường chồng nhau");
  ok(((await u.c.from("base_layout").select("kind").eq("user_id", m.id).eq("kind", "WALL")).data ?? []).length === 6, "Người ấy thấy tường khi do thám");

  // ---- kiểu nhà (BASE-14) ----
  const cSt = await coins(m.id);
  ok(await err(m.c.rpc("buy_style", { p_code: "style_temple" })) === "ITEM_LOCKED", "Đền Tình Yêu khoá tới khi màn 3 đóng");
  ok(await err(m.c.rpc("set_style", { p_code: "style_town" })) === "ITEM_NOT_OWNED", "Chưa mua thì không chọn được kiểu");
  ok(!(await m.c.rpc("buy_style", { p_code: "style_town" })).error && await coins(m.id) === cSt - 2000, "TC-44 mua Phố cổ -2000 xu");
  const h1 = (await admin.from("user_house").select("style,hp,max_hp").eq("user_id", m.id).single()).data!;
  ok(h1.style === "town", "Mua xong dùng luôn kiểu Phố cổ", h1);
  ok(await err(m.c.rpc("buy_style", { p_code: "style_town" })) === "ALREADY_OWNED", "Không mua 1 kiểu 2 lần");
  ok(!(await m.c.rpc("set_style", { p_code: "style_classic" })).error && (await admin.from("user_house").select("style").eq("user_id", m.id).single()).data!.style === "classic", "Chọn lại Làng quê (miễn phí)");

  // ---- buff thú cưng cộng theo chỉ số (BASE-03) ----
  const def0 = Number((await admin.rpc("calc_def", { p_user: m.id })).data), atk0 = Number((await admin.rpc("calc_atk", { p_user: m.id })).data), coin0 = Number((await admin.rpc("coin_bonus_pct", { p_user: m.id })).data);
  await admin.from("user_pets").insert([{ user_id: m.id, pet_code: "armabee", nickname: "Ong", level: 2 }, { user_id: m.id, pet_code: "glub", nickname: "Dơi", level: 1 }, { user_id: m.id, pet_code: "mushnub", nickname: "Nấm", level: 3 }]);
  const def1 = Number((await admin.rpc("calc_def", { p_user: m.id })).data), atk1 = Number((await admin.rpc("calc_atk", { p_user: m.id })).data), coin1 = Number((await admin.rpc("coin_bonus_pct", { p_user: m.id })).data);
  ok(Math.abs(def1 - def0 - 12) < 1e-9, "TC-43 Ong mập cấp 2: +12 DEF", { def0, def1 });
  ok(Math.abs(atk1 - atk0 * 1.03) < 1e-6, "Dơi tím cấp 1: +3% ATK", { atk0, atk1 });
  ok(Math.abs(coin1 - coin0 - 0.06) < 1e-9, "Nấm lùn cấp 3: +6% xu màn (cộng dồn với Mèo)", { coin0, coin1 });

  // ---- reset mùa xoá bố cục + đồ trang trí ----
  await admin.from("profiles").update({ role: "ADMIN" }).eq("id", u.id);
  const rs = await u.c.rpc("admin_reset_season", { p_confirm: "RESET" });
  ok(!rs.error, "Reset mùa giải chạy được", rs.error);
  ok(((await admin.from("base_layout").select("ref")).data ?? []).length === 0 && ((await admin.from("user_decor").select("id")).data ?? []).length === 0, "Reset mùa xoá bố cục và đồ trang trí");
  ok(((await admin.from("base_clear").select("obstacle_id")).data ?? []).length === 0 && ((await admin.from("user_styles").select("code")).data ?? []).length === 0, "Reset mùa: vật cản mọc lại, kiểu nhà về mặc định");
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
