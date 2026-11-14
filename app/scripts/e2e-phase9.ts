/* eslint-disable @typescript-eslint/no-explicit-any */
// E2E Phase 9 (trình duyệt thật, DB test): quần đảo màn chơi 3D (LVL-01), xây tháp/bẫy (BASE-10/11),
// tấn công rải quân + server kiểm chứng (BTL-06..08), xem lại, số liệu hiệu năng (SYS-05).
// Chạy: bật server test :3101 rồi `npm run test:e2e9`. XOÁ dữ liệu game của DB test.
import path from "node:path";
import { admin, resetGame, moheoLogin, utdacLogin, ensureOnboarded } from "./it-lib";
import { BASE, SHOTS, check, context, finish, launch, sessionCookies, watchErrors } from "./e2e-lib";
import type { Page } from "playwright";

const shot = (p: Page, name: string) => p.screenshot({ path: path.join(SHOTS, `p9-${name}.png`) });
const perf = async (p: Page) => { await p.waitForFunction(() => (window as any).__perf?.calls > 0, null, { timeout: 120000 }); await p.waitForTimeout(2500); return p.evaluate(() => (window as any).__perf); };
const canvasBox = async (p: Page, testid: string) => (await p.getByTestId(testid).locator("canvas").boundingBox())!;

async function main() {
  await resetGame();
  const m = await moheoLogin(), u = await utdacLogin();   // m = Mỡ heo (phòng thủ), u = Út đặc (tấn công)
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  await admin.rpc("apply_coins", { p_user: m.id, p_amount: 3000, p_reason: "LEVEL_WIN" });
  await admin.from("user_house").update({ level: 1, hp: 500, max_hp: 500 }).eq("user_id", m.id);
  await admin.from("user_army").insert([{ user_id: u.id, unit_code: "sword", quantity: 10 }, { user_id: m.id, unit_code: "sword", quantity: 4 }]);

  const browser = await launch();
  const cm = await context(browser, await sessionCookies("moheo@lovequest.local", "moheo-dev-2026"));
  const pm = await cm.newPage(); watchErrors(pm, "Mỡ heo");

  // ---------- 1. quần đảo màn chơi ----------
  await pm.goto(`${BASE}/levels?fps=1`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pm.getByTestId("islands").waitFor({ timeout: 180000 });
  await pm.waitForFunction(() => (window as any).__islands?.n > 0, null, { timeout: 180000 });
  const pf1 = await perf(pm);
  check("LVL-01 / TC-49 quần đảo 3D hiện đủ 30 đảo", (await pm.evaluate(() => (window as any).__islands.n)) === 30);
  check("Thẻ đảo mở ở màn đang chơi (Màn 1) + nút Vào màn", (await pm.getByTestId("island-card").innerText()).includes("Màn 1") && (await pm.getByTestId("island-go").getAttribute("href")) === "/levels/1");
  await shot(pm, "1-islands");
  // chạm đảo 2 bằng chuột thật (toạ độ chiếu từ 3D)
  const box = await canvasBox(pm, "islands");
  const p2 = await pm.evaluate(() => (window as any).__islands.project(1));
  await pm.mouse.click(box.x + p2.x, box.y + p2.y);
  await pm.waitForFunction(() => document.querySelector('[data-testid="island-card"]')?.textContent?.includes("Màn 2"), null, { timeout: 30000 }).catch(() => undefined);
  check("TC-32 chạm đảo 2 (đang khoá) → thẻ Màn 2, không có nút vào", (await pm.getByTestId("island-card").innerText()).includes("Màn 2") && (await pm.getByTestId("island-locked").count()) === 1 && (await pm.getByTestId("island-go").count()) === 0);
  await pm.waitForTimeout(1500); await shot(pm, "1b-island-locked");
  check(`SYS-05 quần đảo: ${pf1.calls} lần vẽ, ${Math.round(pf1.tris / 1000)}k tam giác (≤ 150 lần vẽ)`, pf1.calls <= 150, pf1);

  // ---------- 2. căn cứ: mua tháp + bẫy trong màn 3D, lưu bố cục ----------
  await pm.goto(`${BASE}/base?fps=1`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pm.getByTestId("base-scene").waitFor({ timeout: 180000 });
  await pm.getByTestId("open-shop").click();
  const panel = pm.getByTestId("build-panel");
  await panel.getByText("Phòng thủ").click();
  await panel.locator('[data-code="def_tower"] button').click();
  await pm.waitForFunction(() => (window as any).__base?.placed?.some((x: any) => x.kind === "DEFENSE"), null, { timeout: 60000 });
  await panel.locator('[data-code="trap_spike"] button').click();
  await pm.waitForFunction(() => (window as any).__base?.placed?.some((x: any) => x.kind === "TRAP"), null, { timeout: 60000 });
  check("BASE-10/11 mua Tháp canh + Bẫy chông trong màn 3D → tự đặt lên lưới", true);
  check("TC-33 tháp thứ 2 bị khoá theo cấp nhà", (await panel.locator('[data-code="def_tower"]').innerText()).includes("Đã đủ số lượng") || (await panel.locator('[data-code="def_tower"]').innerText()).includes("Cần nhà cấp"));
  await panel.getByText("✕").click();
  // đặt đúng chỗ bằng RPC (kéo thả đã có test riêng ở test:flow): tháp tâm (0,6) m, bẫy (5,-1) m, đội gác (-9,-1) m
  const defs = (await admin.from("user_defenses").select("id,kind").eq("user_id", m.id)).data!;
  const lay = await m.c.rpc("save_base_layout", { p_items: [{ kind: "DEFENSE", ref: defs.find((d: any) => d.kind === "DEFENSE")!.id, x: 19, z: 22 }, { kind: "TRAP", ref: defs.find((d: any) => d.kind === "TRAP")!.id, x: 22, z: 19 }, { kind: "UNIT", ref: "sword", x: 15, z: 19 }] });
  check("Lưu bố cục có tháp + bẫy + đội gác", !lay.error, lay.error);
  await pm.reload({ waitUntil: "domcontentloaded" }); await pm.getByTestId("base-scene").waitFor({ timeout: 180000 });
  const pf2 = await perf(pm);
  await pm.getByTestId("edit-base").click(); await pm.waitForTimeout(800);
  await shot(pm, "2-base-defenses");
  check(`SYS-05 căn cứ: ${pf2.calls} lần vẽ, ${Math.round(pf2.tris / 1000)}k tam giác`, pf2.calls <= 260, pf2);
  // ---------- 2b. dọn vật cản để mở rộng căn cứ (BASE-13) ----------
  await pm.getByText("✖ Huỷ").click().catch(() => undefined);
  const { data: obsAll } = await admin.from("obstacles").select("*").order("id");
  const bx = (await pm.getByTestId("base-scene").locator("canvas").boundingBox())!;
  // vùng trống 24×24 ô → vật cản ở xa: thu nhỏ camera để thấy vòng rừng
  await pm.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
  for (let i = 0; i < 6; i++) { await pm.mouse.wheel(0, 300); await pm.waitForTimeout(120); }
  await pm.waitForTimeout(1500);
  // chọn vật cản 2×2 nằm gọn trong khung nhìn (tránh mép và vùng nút)
  const cands = await pm.evaluate(([list, w, h]) => (list as any[]).filter((o) => o.size === 2).map((o) => ({ o, p: (window as any).__base.project(o.x, o.z, 2) }))
    .filter(({ p }) => p.x > 80 && p.x < (w as number) - 80 && p.y > 140 && p.y < (h as number) - 80), [obsAll, bx.width, bx.height] as const);
  check("Có vật cản nằm trong khung nhìn", cands.length > 0, cands.length);
  const near = cands[0].o, pt = cands[0].p;
  const c0 = (await admin.from("profiles").select("coins").eq("id", m.id).single()).data!.coins;
  await pm.mouse.click(bx.x + pt.x, bx.y + pt.y);
  await pm.getByTestId("obstacle-panel").waitFor({ timeout: 30000 });
  check("TC-40 chạm vật cản → bảng Dọn có giá", (await pm.getByTestId("obstacle-panel").innerText()).includes(String(near.price)));
  await pm.getByTestId("clear-obstacle").click();
  await pm.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes("Đã dọn"), null, { timeout: 60000 });
  const c1 = (await admin.from("profiles").select("coins").eq("id", m.id).single()).data!.coins;
  check(`Dọn ${near.code} 2×2 → trừ ${near.price} xu, ghi vào base_clear`, c1 === c0 - near.price && ((await admin.from("base_clear").select("obstacle_id").eq("user_id", m.id)).data ?? []).length === 1, { c0, c1, price: near.price });
  await pm.waitForTimeout(1500); await shot(pm, "2b-cleared");
  await pm.goto("about:blank");

  // ---------- 3. Út đặc do thám + tấn công rải quân ----------
  const cu = await context(browser, await sessionCookies("utdac@lovequest.local", "utdac-dev-2026"));
  const pu = await cu.newPage(); watchErrors(pu, "Út đặc");
  pu.on("dialog", (d) => void d.accept());
  await pu.goto(`${BASE}/base/partner?fps=1`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pu.getByTestId("attack-hud").waitFor({ timeout: 180000 });
  await pu.waitForFunction(() => (window as any).__base?.placed?.length > 0, null, { timeout: 120000 });
  const seen = await pu.evaluate(() => (window as any).__base.placed.map((x: any) => x.kind));
  check("TC-34 do thám: thấy tháp, KHÔNG thấy bẫy", seen.includes("DEFENSE") && !seen.includes("TRAP"), seen);
  await pu.waitForTimeout(2500); await shot(pu, "3-scout");
  await pu.getByTestId("attack-btn").click();
  await pu.getByTestId("troop-bar").waitFor({ timeout: 120000 });
  await pu.waitForFunction(() => !!(window as any).__base?.sim, null, { timeout: 60000 });
  const b2 = await canvasBox(pu, "base-scene");
  const clickM = async (x: number, z: number) => { const q = await pu.evaluate(([a, b]) => (window as any).__base.projectM(a, b), [x, z]); await pu.mouse.click(b2.x + q.x, b2.y + q.y); await pu.waitForTimeout(250); };
  await clickM(3.5, -1);    // vùng đỏ sát nhà (tâm nhà ở (−1, −1))
  check("TC-35 chạm vùng đỏ → báo lỗi, chưa mất lính", (await pu.locator('[role="status"]').innerText()).includes("Quá gần") && (await pu.getByTestId("troop-sword").innerText()).includes("×10"));
  await clickM(12, -1);     // tốp 1: đi về phía nhà, ngang qua bẫy ở (5,−1)
  await clickM(-12, 8);     // tốp 2: phía trên-trái (z lớn bị thanh chọn lính che), gần đội gác ở (−8,0)
  check("BTL-07 thả 2 tốp × 5 lính", (await pu.getByTestId("troop-sword").innerText()).includes("×0"), await pu.getByTestId("troop-sword").innerText());
  await pu.waitForTimeout(4000); await shot(pu, "4-battle");
  const mid = await pu.evaluate(() => { const s = (window as any).__base.sim; return { tick: s.tick, groups: s.atk.length, guards: s.guards.length, defs: s.defs.length, traps: s.traps.length }; });
  check("Chiến trường có 2 tốp lính, 1 tháp, 1 bẫy, 1 đội gác", mid.groups === 2 && mid.defs === 1 && mid.traps === 1 && mid.guards === 1, mid);
  const pf3 = await perf(pu);
  await pu.getByText(/▶ ×1|⏩ ×2/).click();
  await pu.getByTestId("battle-result").waitFor({ timeout: 240000 });
  const dmgUi = Number((await pu.getByTestId("battle-damage").innerText()).replace(/[^\d]/g, ""));
  const lootUi = Number((await pu.getByTestId("battle-loot").innerText()).replace(/[^\d]/g, ""));
  const a = (await admin.from("attacks").select("*").eq("attacker_id", u.id).order("created_at", { ascending: false }).limit(1)).data![0];
  const hpNow = (await admin.from("user_house").select("hp").eq("user_id", m.id).single()).data!.hp;
  check(`BTL-08 kết quả trên màn hình = server: −${a.damage} HP, +${a.loot} xu`, a.status === "DONE" && dmgUi === a.damage && lootUi === a.loot && hpNow === 500 - a.damage && a.loot === Math.round(a.damage * 0.5), { dmgUi, lootUi, a: { d: a.damage, l: a.loot, s: a.status }, hpNow });
  const local = await pu.evaluate(() => { const s = (window as any).__base.sim; return Math.max(0, Math.min(s.snap.house.hp, Math.round(s.snap.house.hp - Math.max(0, s.houseHp)))); });
  check("Mô phỏng ở client ra đúng sát thương server tính (xác định)", local === a.damage, { local, server: a.damage });
  check("Trận có bẫy nổ / lính ngã được ghi lại", a.stats?.trapsHit === 1 && a.deploys?.list?.length === 2, a.stats);
  await shot(pu, "5-result");
  check(`SYS-05 trận đánh: ${pf3.calls} lần vẽ, ${Math.round(pf3.tris / 1000)}k tam giác`, pf3.calls <= 300, pf3);

  // ---------- 4. xem lại ----------
  await pu.goto(`${BASE}/battle/${a.id}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pu.getByTestId("base-scene").waitFor({ timeout: 180000 });
  await pu.getByText(/▶ ×1/).click().catch(() => undefined);
  await pu.waitForTimeout(5000); await shot(pu, "6-replay");
  await pu.getByTestId("battle-result").waitFor({ timeout: 240000 });
  const rep = await pu.evaluate(() => { const s = (window as any).__base.sim; return Math.max(0, Math.min(s.snap.house.hp, Math.round(s.snap.house.hp - Math.max(0, s.houseHp)))); });
  check("TC-38 xem lại: phát lại ra đúng sát thương đã ghi", rep === a.damage && Number((await pu.getByTestId("battle-damage").innerText()).replace(/[^\d]/g, "")) === a.damage, { rep, d: a.damage });
  await pu.goto("about:blank");

  // ---------- 5. điện thoại: mức Thấp tự chọn, đo lần vẽ ----------
  const cmob = await context(browser, await sessionCookies("moheo@lovequest.local", "moheo-dev-2026"), true);
  const pmob = await cmob.newPage(); watchErrors(pmob, "điện thoại");
  await pmob.goto(`${BASE}/levels?fps=1`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pmob.getByTestId("islands").waitFor({ timeout: 180000 });
  const m1 = await perf(pmob); await shot(pmob, "7-mobile-islands");
  check(`SYS-05 điện thoại – quần đảo: mức ${m1.tier}, ${m1.calls} lần vẽ, ${Math.round(m1.tris / 1000)}k tam giác`, m1.tier === "low" && m1.calls <= 150, m1);
  await pmob.goto(`${BASE}/base?fps=1`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pmob.getByTestId("base-scene").waitFor({ timeout: 180000 });
  const m2 = await perf(pmob); await shot(pmob, "8-mobile-base");
  check(`SYS-05 điện thoại – căn cứ: ${m2.calls} lần vẽ, ${Math.round(m2.tris / 1000)}k tam giác`, m2.calls <= 150, m2);
  await pmob.goto(`${BASE}/world?fps=1`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pmob.waitForFunction(() => !!(window as any).__world, null, { timeout: 180000 });
  const m3 = await perf(pmob); await shot(pmob, "9-mobile-world");
  check(`SYS-05 điện thoại – làng: ${m3.calls} lần vẽ, ${Math.round(m3.tris / 1000)}k tam giác`, m3.calls <= 150, m3);

  await browser.close();
  finish();
}
main().catch((e) => { console.error(e); process.exit(1); });
