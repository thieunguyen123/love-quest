/* eslint-disable @typescript-eslint/no-explicit-any */
// Test tích hợp BTL-01 (sửa luật, TC-61): lính ngã trong trận là MẤT THẬT — cả lính tấn công lẫn lính gác của người bị đánh
import { admin, ok, done, moheoLogin, utdacLogin, ensureOnboarded, resetGame } from "./it-lib";
import { beginBattle, finishBattle } from "../src/lib/attack-core";

async function main() {
  await resetGame();
  const m = await moheoLogin(), u = await utdacLogin();   // m = người phòng thủ, u = người tấn công
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  const qty = async (id: string, code: string) => (await admin.from("user_army").select("quantity").eq("user_id", id).eq("unit_code", code).maybeSingle()).data?.quantity ?? 0;

  await admin.from("user_army").insert([{ user_id: u.id, unit_code: "sword", quantity: 20 }, { user_id: u.id, unit_code: "knight", quantity: 10 }]);
  await admin.from("user_army").insert([{ user_id: m.id, unit_code: "sword", quantity: 8 }]);   // lính gác trong căn cứ người bị đánh
  await admin.from("user_house").update({ level: 1, hp: 500, max_hp: 500 }).eq("user_id", m.id);

  const b = await beginBattle(admin, u.id, m.id);
  ok(b.status === 200, "Bắt đầu trận", b.body);
  const snap = b.body.snapshot as any;
  ok(snap.guards.some((g: any) => g.unit === "sword" && g.qty === 8), "Ảnh chụp trận có 8 lính gác", snap.guards);
  const g = snap.guards.find((x: any) => x.unit === "sword");
  // kỵ binh thả sát đội gác để chắc chắn có lính gác ngã; lính kiếm đánh nhà
  const deploys = [{ t: 0, unit: "sword", n: 5, x: 6, z: -1 }, { t: 0, unit: "sword", n: 5, x: -8, z: -1 }, { t: 0, unit: "knight", n: 5, x: g.x + (g.x >= 0 ? 3 : -3), z: g.z }];
  const r = await finishBattle(admin, u.id, { id: b.body.id as string, deploys, endTick: null });
  ok(r.status === 200, "Kết thúc trận", r.body);
  const out = r.body.out as any;
  const lost = out.lost.sword ?? 0, gl = out.guardsLost.sword ?? 0;
  const kl = out.lost.knight ?? 0;
  ok(out.deployed.sword === 10 && out.deployed.knight === 5, `Thả 10 lính kiếm (ngã ${lost}) + 5 kỵ binh (ngã ${kl}), lính gác ngã ${gl}`);
  ok(await qty(u.id, "knight") === 10 - kl, `Còn ${10 - kl} kỵ binh`);
  ok(gl > 0, "Có lính gác bị hạ");
  ok(await qty(u.id, "sword") === 20 - lost, `Người tấn công còn ${20 - lost} Lính kiếm (mất đúng số ngã, lính không thả vẫn còn)`, { lost, now: await qty(u.id, "sword") });
  ok(await qty(m.id, "sword") === 8 - gl, `Người bị đánh còn ${8 - gl} lính gác (mất đúng số bị hạ)`, { gl, now: await qty(m.id, "sword") });
  ok(lost + gl > 0, "Trận có thương vong để kiểm tra");
  const st = (await admin.from("attacks").select("stats").eq("id", b.body.id).single()).data!.stats;
  ok((st.unitsLost?.sword ?? 0) === lost && (st.guardsLostApplied?.sword ?? 0) === gl, "Lưu số lính mất vào attacks.stats", st);
  const n = (await admin.from("notifications").select("body").eq("user_id", m.id).eq("type", "ATTACKED").order("created_at", { ascending: false }).limit(1)).data![0];
  ok(gl === 0 || n.body.includes(`${gl} lính gác hy sinh`), "Thông báo cho người bị đánh nêu số lính gác hy sinh", n);

  // UNIT_LOSS_PCT = 0 → quân tự hồi đủ
  await admin.from("game_config").update({ value: 0 }).eq("key", "UNIT_LOSS_PCT");
  await admin.from("attacks").update({ created_at: new Date(Date.now() - 3 * 3600000).toISOString() }).eq("defender_id", m.id);
  const a0 = await qty(u.id, "sword"), g0 = await qty(m.id, "sword");
  const b2 = await beginBattle(admin, u.id, m.id);
  const r2 = await finishBattle(admin, u.id, { id: b2.body.id as string, deploys: [{ t: 0, unit: "sword", n: Math.min(5, a0), x: 6, z: -1 }], endTick: null });
  ok(r2.status === 200 && await qty(u.id, "sword") === a0 && await qty(m.id, "sword") === g0, "UNIT_LOSS_PCT = 0 → không mất lính", r2.body);
  await admin.from("game_config").update({ value: 1 }).eq("key", "UNIT_LOSS_PCT");
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
