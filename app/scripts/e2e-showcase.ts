/* eslint-disable @typescript-eslint/no-explicit-any */
// Ảnh chụp trưng bày mô hình 3D (DB test, XOÁ dữ liệu game): căn cứ đủ đồ ở nhiều cấp nhà, thú cưng, trận đánh, làng, quần đảo.
// Chạy: bật server test :3101 rồi `IT_ENV=.env.test npx tsx scripts/e2e-showcase.ts [cấp nhà…]` → .e2e-shots/show-*.png
import path from "node:path";
import { admin, resetGame, moheoLogin, utdacLogin, ensureOnboarded } from "./it-lib";
import { BASE, SHOTS, check, context, finish, launch, sessionCookies, watchErrors, pickAllAndGo } from "./e2e-lib";
import type { Page } from "playwright";

const shot = (p: Page, name: string) => p.screenshot({ path: path.join(SHOTS, `show-${name}.png`) });
const settle = async (p: Page, ms = 6000) => { await p.waitForFunction(() => (window as any).__perf?.calls > 0, null, { timeout: 180000 }); await p.waitForTimeout(ms); };

async function main() {
  const levels = process.argv.slice(2).map(Number).filter((n) => n >= 0 && n <= 5);
  await resetGame();
  const m = await moheoLogin(), u = await utdacLogin();
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  await admin.from("profiles").update({ favorite_color: "#3b82f6" }).eq("id", m.id);
  // thú cưng ở đủ các giai đoạn tiến hoá: Lv1..Lv5
  await admin.from("user_pets").insert([["cat", "Mướp", 3], ["corgi", "Lu", 1], ["owl", "Cú", 4], ["dragon", "Rồng", 5], ["mushnub", "Nấm", 3], ["armabee", "Ong", 2], ["glub", "Dơi", 5]]
    .map(([c, n, l]) => ({ user_id: m.id, pet_code: c, nickname: n, level: l })));
  await admin.from("user_army").insert([{ user_id: m.id, unit_code: "sword", quantity: 6 }, { user_id: m.id, unit_code: "archer", quantity: 4 }, { user_id: m.id, unit_code: "catapult", quantity: 1 },
    { user_id: u.id, unit_code: "sword", quantity: 5 }, { user_id: u.id, unit_code: "knight", quantity: 2 }, { user_id: u.id, unit_code: "mage", quantity: 5 }, { user_id: u.id, unit_code: "ninja", quantity: 5 }, { user_id: u.id, unit_code: "yeti", quantity: 2 }]);
  await admin.from("user_weapons").insert({ user_id: m.id, weapon_code: "iron_sword" });
  await admin.from("user_defenses").insert([{ user_id: m.id, code: "def_tower", kind: "DEFENSE" }, { user_id: m.id, code: "def_tower", kind: "DEFENSE" }, { user_id: m.id, code: "def_cannon", kind: "DEFENSE" },
    { user_id: m.id, code: "trap_spike", kind: "TRAP" }, { user_id: m.id, code: "trap_bomb", kind: "TRAP" }]);
  // nhà máy + 1 đơn đang luyện (biển đếm ngược) + 60 đoạn tường
  await admin.from("user_factories").insert(["fac_sword", "fac_archer", "fac_knight"].map((code) => ({ user_id: m.id, code })));
  await admin.from("training").insert({ user_id: m.id, unit_code: "archer", qty: 5, cost: 450, started_at: new Date().toISOString(), done_at: new Date(Date.now() + 3600e3).toISOString() });
  await admin.from("user_defenses").insert(Array.from({ length: 60 }, () => ({ user_id: m.id, code: "wall", kind: "WALL" })));
  await admin.from("user_decor").insert(["deco_bush", "deco_bush", "deco_lamp", "deco_flag", "deco_well", "deco_bench", "deco_tree"].map((code) => ({ user_id: m.id, code })));

  const browser = await launch();
  const cm = await context(browser, await sessionCookies("moheo@lovequest.local", "moheo-dev-2026"));
  const pm = await cm.newPage(); watchErrors(pm, "Mỡ heo");
  const styles = (process.env.STYLES ?? "classic").split(",");
  for (const lv of levels.length ? levels : [0, 3, 5]) for (const st of styles) {
    await admin.from("user_house").update({ level: lv, hp: 6000, max_hp: 6000, style: st }).eq("user_id", m.id);
    // vòng tường cách nhà 2 ô (lưới 40)
    const hsz = [2, 3, 3, 4, 4, 5][lv], h0 = Math.floor((40 - hsz) / 2), x0 = h0 - 3, x1 = h0 + hsz + 2, ring: [number, number][] = [];
    for (let x = x0; x <= x1; x++) ring.push([x, x0], [x, x1]);
    for (let z = x0 + 1; z < x1; z++) ring.push([x0, z], [x1, z]);
    const wIds = ((await admin.from("user_defenses").select("id").eq("user_id", m.id).eq("kind", "WALL")).data ?? []).map((w: any) => w.id);
    const gate = new Set([`${x0 + 3},${x1}`, `${x0 + 4},${x1}`]);   // chừa cổng
    const sv = await m.c.rpc("save_base_layout", { p_items: ring.filter(([x, z]) => !gate.has(`${x},${z}`)).slice(0, wIds.length).map(([x, z], i) => ({ kind: "WALL", ref: wIds[i], x, z })) });
    if (sv.error) console.log("save walls", sv.error.message);
    await pm.goto(`${BASE}/base?fps=1&gfx=high`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await pm.getByTestId("base-scene").waitFor({ timeout: 180000 }); await settle(pm);
    await shot(pm, `base-l${lv}-${st}`);
    // cận cảnh: zoom vào giữa
    const box = (await pm.getByTestId("base-scene").locator("canvas").boundingBox())!;
    await pm.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 6; i++) { await pm.mouse.wheel(0, -260); await pm.waitForTimeout(120); }
    await pm.waitForTimeout(1500); await shot(pm, `base-l${lv}-${st}-zoom`);
  }
  check("Căn cứ hiện đủ, không lỗi JS", true);
  await pm.goto(`${BASE}/levels?fps=1&gfx=high`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pm.getByTestId("islands").waitFor({ timeout: 180000 }); await settle(pm, 3000); await shot(pm, "islands");
  await pm.goto("about:blank");

  // trận đánh: Út đặc tấn công, tự rải quân
  const cu = await context(browser, await sessionCookies("utdac@lovequest.local", "utdac-dev-2026"));
  const pu = await cu.newPage(); watchErrors(pu, "Út đặc"); pu.on("dialog", (d) => void d.accept());
  await pu.goto(`${BASE}/base/partner?fps=1&gfx=high`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pu.getByTestId("attack-hud").waitFor({ timeout: 180000 }); await settle(pu, 2000);
  await pu.getByTestId("attack-btn").click();
  await pickAllAndGo(pu);
  await pu.getByTestId("troop-bar").waitFor({ timeout: 120000 });
  await pu.getByTestId("auto-deploy").click();
  await pu.waitForTimeout(9000); await shot(pu, "battle-1");
  await pu.waitForTimeout(9000); await shot(pu, "battle-2");
  await pu.goto("about:blank");

  // điện thoại
  const cmob = await context(browser, await sessionCookies("moheo@lovequest.local", "moheo-dev-2026"), true);
  const pmob = await cmob.newPage(); watchErrors(pmob, "điện thoại");
  await pmob.goto(`${BASE}/base?fps=1`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await pmob.getByTestId("base-scene").waitFor({ timeout: 180000 }); await settle(pmob);
  await shot(pmob, "mobile-base");
  console.log("perf mobile", await pmob.evaluate(() => (window as any).__perf));
  await browser.close();
  finish();
}
main().catch((e) => { console.error(e); process.exit(1); });
