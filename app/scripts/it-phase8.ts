/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp Phase 8 – admin cấu hình, nhật ký, reset mùa giải, push trigger
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame, coins } from "./it-lib";

async function main() {
  await resetGame();
  const m = await moheoLogin(); const u = await utdacLogin();
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const err = async (p: PromiseLike<{ error: any }>) => (await p).error?.message;

  // ADM-03 cấu hình
  ok(await err(m.c.rpc("admin_set_config", { p_key: "SHIELD_PRICE", p_value: 99 })) === "FORBIDDEN", "TC-03 PLAYER không sửa được cấu hình");
  ok(await err(u.c.rpc("admin_set_config", { p_key: "SHIELD_PRICE", p_value: "abc" })) === "TYPE_MISMATCH", "Sai kiểu dữ liệu bị chặn");
  ok(await err(u.c.rpc("admin_set_config", { p_key: "NOPE", p_value: 1 })) === "KEY_NOT_FOUND", "Key không tồn tại");
  ok(await err(u.c.rpc("admin_set_config", { p_key: "SHIELD_PRICE", p_value: 99 })) === undefined, "ADMIN đổi SHIELD_PRICE = 99");
  const c0 = await coins(m.id);
  await m.c.rpc("buy_shield");
  ok(await coins(m.id) === c0 - 99, "ADM-03 mua khiên giờ tốn 99 xu (áp dụng ngay cho hành động mới)");
  await u.c.rpc("admin_set_config", { p_key: "SHIELD_PRICE", p_value: 150 });
  const logs = (await u.c.from("admin_logs").select("action,diff")).data!;
  ok(logs.length === 2 && logs[0].action === "CONFIG_SET", "ADM-04 ghi nhật ký admin (2 lần đổi)", logs);
  ok((await m.c.from("admin_logs").select("id")).data!.length === 0, "PLAYER không đọc được nhật ký admin");
  ok(await err(m.c.rpc("admin_log", { p_action: "X", p_entity: "x", p_entity_id: "1" })) === "FORBIDDEN", "PLAYER không ghi nhật ký giả");

  // Người chơi không ghi trực tiếp game_config
  const direct = await m.c.from("game_config").update({ value: 1 }).eq("key", "SHIELD_PRICE").select();
  ok(!direct.data?.length, "PLAYER không sửa trực tiếp game_config (RLS)");

  // Reset mùa giải
  await admin.rpc("apply_coins", { p_user: m.id, p_amount: 3000, p_reason: "LEVEL_WIN" });
  await admin.from("user_pets").insert({ user_id: m.id, pet_code: "cat", nickname: "Miu" });
  await admin.from("levels").update({ status: "CLOSED", winner_id: m.id }).eq("order_no", 1);
  await admin.from("user_house").update({ level: 3, hp: 50, max_hp: 2000 }).eq("user_id", m.id);
  ok(await err(m.c.rpc("admin_reset_season", { p_confirm: "RESET" })) === "FORBIDDEN", "PLAYER không reset được");
  ok(await err(u.c.rpc("admin_reset_season", { p_confirm: "reset" })) === "CONFIRM_REQUIRED", "Phải gõ đúng RESET");
  ok(await err(u.c.rpc("admin_reset_season", { p_confirm: "RESET" })) === undefined, "ADMIN reset mùa giải");
  const prof = (await admin.from("profiles").select("coins,display_name,onboarded_at").eq("id", m.id).single()).data!;
  ok(prof.coins === 500 && prof.display_name === "Mỡ heo" && !!prof.onboarded_at, "Reset: xu về 500, giữ tên & tài khoản", prof);
  ok((await admin.from("user_pets").select("id").eq("user_id", m.id)).data!.length === 0, "Reset: xóa thú cưng");
  const h = (await admin.from("user_house").select("*").eq("user_id", m.id).single()).data!;
  ok(h.level === 0 && h.hp === 200, "Reset: nhà về cấp 0", h);
  const l1 = (await admin.from("levels").select("status,winner_id").eq("order_no", 1).single()).data!;
  ok(l1.status === "OPEN" && l1.winner_id === null, "Reset: màn 1 mở lại, xóa người thắng");
  ok((await admin.from("words").select("id")).data!.length > 20, "Reset: giữ nguyên từ vựng");
  const led = (await admin.from("coin_transactions").select("amount").eq("user_id", m.id)).data!.reduce((a: number, t: any) => a + t.amount, 0);
  ok(led === 500, "Reset: sổ cái chỉ còn khoản START", led);

  // push trigger không làm hỏng giao dịch khi chưa cấu hình / pg_net lỗi
  const n = await admin.rpc("notify", { p_user: m.id, p_type: "T", p_title: "t", p_body: "b" });
  ok(!n.error, "Trigger push không chặn việc tạo thông báo (chưa cấu hình)", n.error);
  await admin.from("game_config").upsert({ key: "PUSH_WEBHOOK_URL", value: "http://127.0.0.1:9/none" });
  const n2 = await admin.rpc("notify", { p_user: m.id, p_type: "T", p_title: "t2", p_body: "b" });
  ok(!n2.error, "Webhook push lỗi/không tồn tại vẫn không làm hỏng giao dịch game", n2.error);
  await admin.from("game_config").delete().eq("key", "PUSH_WEBHOOK_URL");
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
