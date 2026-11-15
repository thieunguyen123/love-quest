/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp BTL-01/BTL-04 (sửa luật, TC-62..64): chọn quân xuất trận, quân rời căn cứ, khiên bí mật chặn → mất quân, lính sống trở về
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame } from "./it-lib";
import { beginBattle, finishBattle } from "../src/lib/attack-core";

async function main() {
  await resetGame();
  const m = await moheoLogin(), u = await utdacLogin();   // m = người tấn công, u = người bị đánh
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const err = async (p: PromiseLike<{ error: any }>) => (await p).error?.message;
  const qty = async (id: string, code: string) => (await admin.from("user_army").select("quantity").eq("user_id", id).eq("unit_code", code).maybeSingle()).data?.quantity ?? 0;
  const set = async (id: string, code: string, n: number) => admin.from("user_army").upsert({ user_id: id, unit_code: code, quantity: n });
  const unprotect = () => admin.from("attacks").update({ created_at: new Date(Date.now() - 3 * 3600000).toISOString() }).eq("defender_id", u.id);
  await admin.from("user_house").update({ level: 2, hp: 900, max_hp: 900 }).eq("user_id", u.id);
  await admin.from("user_house").update({ level: 2 }).eq("user_id", m.id);
  await set(m.id, "sword", 10); await set(m.id, "knight", 4);

  // ---- TC-62 chọn quân ----
  ok((await beginBattle(admin, m.id, u.id, { sword: 11 })).body.error === "INVALID_ARMY", "Chọn nhiều hơn số đang có → INVALID_ARMY");
  ok((await beginBattle(admin, m.id, u.id, {})).body.error === "NO_ARMY", "Không chọn lính nào → NO_ARMY");
  ok(await qty(m.id, "sword") === 10, "Chọn sai không mất lính");
  const b = await beginBattle(admin, m.id, u.id, { sword: 6, knight: 2 });
  const snap = b.body.snapshot as any;
  ok(b.status === 200 && snap.army.length === 2 && snap.army.find((a: any) => a.unit === "sword").qty === 6 && snap.army.find((a: any) => a.unit === "knight").qty === 2, "Trận chỉ có 6 Lính kiếm + 2 Kỵ binh đã chọn", snap?.army);
  ok(await qty(m.id, "sword") === 4 && await qty(m.id, "knight") === 2, "Quân mang đi rời căn cứ: ở nhà còn 4 Lính kiếm + 2 Kỵ binh");
  const used = (await admin.rpc("army_used", { p_user: m.id })).data;
  const slots = new Map(((await admin.from("shop_items").select("code,slots").in("code", ["sword", "knight"])).data ?? []).map((x: any) => [x.code, x.slots]));
  ok(used === 10 * slots.get("sword") + 4 * slots.get("knight"), "Lính đang đi đánh vẫn tính vào sức chứa", { used });
  // ---- TC-64 lính sống trở về ----
  const r = await finishBattle(admin, m.id, { id: b.body.id as string, deploys: [{ t: 0, unit: "sword", n: 5, x: 6, z: -1 }, { t: 0, unit: "knight", n: 2, x: -8, z: -1 }], endTick: null });
  ok(r.status === 200, "Kết thúc trận", r.body);
  const out = r.body.out as any, ls = out.lost.sword ?? 0, lk = out.lost.knight ?? 0;
  ok(await qty(m.id, "sword") === 10 - ls && await qty(m.id, "knight") === 4 - lk, `Lính sống trở về: Lính kiếm ${10 - ls}/10 (ngã ${ls}, 1 con không thả cũng về), Kỵ binh ${4 - lk}/4`, { ls, lk });
  ok(JSON.stringify(r.body.returned) === JSON.stringify(Object.fromEntries(Object.entries({ sword: 6 - ls, knight: 2 - lk }).filter(([, v]) => v > 0))), "Kết quả trả về số lính trở về", r.body.returned);

  // bỏ dở → về đủ
  await unprotect();
  const b2 = await beginBattle(admin, m.id, u.id, { sword: 3 });
  const s2 = await qty(m.id, "sword");
  await admin.from("attacks").update({ created_at: new Date(Date.now() - 11 * 60000).toISOString() }).eq("id", b2.body.id as string);
  await admin.rpc("_expire_attacks");
  ok(await qty(m.id, "sword") === s2 + 3 && (await admin.from("attacks").select("status").eq("id", b2.body.id as string).single()).data!.status === "EXPIRED", "TC-64 trận bỏ dở → 3 lính trở về đủ");
  // trận dở rồi xuất trận mới → quân trận dở về
  await unprotect();
  const b3 = await beginBattle(admin, m.id, u.id, { sword: 2 });
  const s3 = await qty(m.id, "sword");
  await unprotect();
  const b4 = await beginBattle(admin, m.id, u.id, { sword: 1 });
  ok(b4.status === 200 && await qty(m.id, "sword") === s3 + 2 - 1, "Xuất trận mới khi trận trước bỏ dở → quân trận trước về, quân mới đi", { s3, now: await qty(m.id, "sword") });
  await finishBattle(admin, m.id, { id: b4.body.id as string, deploys: [], endTick: 0 });
  void b3;

  // ---- TC-63 khiên bí mật ----
  await unprotect();
  await admin.rpc("apply_coins", { p_user: u.id, p_amount: 1000, p_reason: "LEVEL_WIN" });
  ok(await err(u.c.rpc("activate_shield")) === undefined && await err(u.c.rpc("buy_shield")) === undefined, "Út đặc bật khiên miễn phí + mua thêm 1 khiên trong kho (tổng 2 khiên)");
  const shieldsLeft = async () => ((await admin.from("shields").select("activated_at,expires_at,broken_at,source").eq("user_id", u.id)).data ?? [])
    .filter((x: any) => !x.broken_at && (!x.activated_at || Date.parse(x.expires_at) > Date.now())).length;
  ok(((await m.c.from("shields").select("id").eq("user_id", u.id)).data ?? []).length === 0, "Mỡ heo KHÔNG đọc được khiên của Út đặc (RLS)");
  ok((await m.c.rpc("has_active_shield", { p_user: u.id })).error !== null, "Mỡ heo không dò khiên qua RPC has_active_shield");
  ok(((await u.c.from("shields").select("id").eq("user_id", u.id)).data ?? []).length > 0, "Út đặc vẫn thấy khiên của mình");
  const k0 = await qty(m.id, "knight"), w0 = await qty(m.id, "sword");
  const bl = await beginBattle(admin, m.id, u.id, { sword: 2, knight: 1 });
  ok(bl.status === 200 && bl.body.blocked === true && !bl.body.snapshot, "Xuất quân vào nhà có khiên → bị chặn, không có trận", bl.body);
  ok(await qty(m.id, "sword") === w0 - 2 && await qty(m.id, "knight") === k0 - 1, "Mất toàn bộ quân đã chọn (2 Lính kiếm + 1 Kỵ binh), quân ở nhà còn nguyên");
  const n = (await admin.from("notifications").select("title,body").eq("user_id", u.id).eq("type", "SHIELD_BLOCK")).data ?? [];
  ok(n.length === 1 && n[0].body.includes("3 lính"), "Út đặc nhận thông báo khiên đã chặn 3 lính", n);
  const row = (await admin.from("attacks").select("status,army_returned,stats").eq("id", bl.body.id as string).single()).data!;
  ok(row.status === "BLOCKED" && row.army_returned && row.stats.unitsLost.sword === 2, "Ghi trận BLOCKED, quân không trở về", row);
  ok(await shieldsLeft() === 1 && ((await admin.from("shields").select("id").eq("user_id", u.id).is("broken_at", null).not("activated_at", "is", null)).data ?? []).length === 1,
    "TC-65 khiên chặn xong thì MẤT 1 khiên; khiên trong kho tự bật (còn 1)");
  ok(n[0].body.includes("còn 1 khiên"), "Thông báo nói còn 1 khiên", n[0]);
  const bl2 = await beginBattle(admin, m.id, u.id, { sword: 1 });
  ok(bl2.body.blocked === true && await shieldsLeft() === 0, "Lần 2 (bị chặn không tạo bảo hộ 1 giờ) → khiên thứ 2 chặn rồi mất, hết khiên", bl2.body);
  const n2 = (await admin.from("notifications").select("body").eq("user_id", u.id).eq("type", "SHIELD_BLOCK").order("created_at", { ascending: false }).limit(1)).data![0];
  ok(n2.body.includes("HẾT khiên"), "Thông báo báo đã hết khiên", n2);
  const go3 = await beginBattle(admin, m.id, u.id, { sword: 1 });
  ok(go3.status === 200 && go3.body.blocked === false && !!go3.body.snapshot, "Lần 3: hết khiên → vào trận được", go3.body);
  await finishBattle(admin, m.id, { id: go3.body.id as string, deploys: [], endTick: 0 });
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
