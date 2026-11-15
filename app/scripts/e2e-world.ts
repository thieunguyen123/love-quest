// E2E thế giới 3D bằng Chrome headless thật (WebGL SwiftShader): lái xe, va chạm, dốc nhảy, vào khu (overlay), realtime 2 xe.
// Chạy: bật server test (:3101, xem CLAUDE.md) rồi `IT_ENV=.env.test npx tsx scripts/e2e-world.ts`
import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { type Page, type BrowserContext } from "playwright";
import { launch } from "./e2e-lib";
// overlay iframe của làng 3D (không lẫn với trình phát nhạc YouTube ẩn, cũng là iframe)
const OVERLAY = 'iframe:not([src*="youtube"])';
config({ path: path.resolve(__dirname, "..", process.env.IT_ENV ?? ".env.local"), quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3101";
const SHOTS = process.env.E2E_SHOTS ?? path.resolve(__dirname, "..", ".e2e-shots");

type Pose = { x: number; y: number; z: number; h: number; speed: number };
let fails = 0;
const check = (label: string, ok: boolean, info?: unknown) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`, ok ? "" : info ?? ""); if (!ok) fails++; };

async function session(email: string, password: string, name: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw error;
  await c.rpc("complete_onboarding", { p_name: name, p_color: name === "Mỡ heo" ? "#ec4899" : "#3b82f6" });
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const cname = `sb-${new globalThis.URL(URL).hostname.split(".")[0]}-auth-token`;
  const parts: string[] = []; for (let i = 0; i * 3180 < value.length; i++) parts.push(value.slice(i * 3180, (i + 1) * 3180));
  const host = new globalThis.URL(BASE).hostname;
  return parts.length === 1 ? [{ name: cname, value, domain: host, path: "/" }] : parts.map((v, i) => ({ name: `${cname}.${i}`, value: v, domain: host, path: "/" }));
}

const pose = (p: Page) => p.evaluate(() => ({ ...(window as unknown as { __world: { pose: { current: Pose } } }).__world.pose.current }));
const near = (p: Page) => p.evaluate(() => (window as unknown as { __world: { near: { current: { id: string } | null } } }).__world.near.current?.id ?? null);
// đo FPS (viết dạng chuỗi để tsx không chèn helper __name vào code chạy trong trình duyệt)
const fpsOf = (p: Page): Promise<number> => p.evaluate(`new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); })`);
async function hold(p: Page, keys: string[], ms: number) { for (const k of keys) await p.keyboard.down(k); await p.waitForTimeout(ms); for (const k of keys) await p.keyboard.up(k); }
// chờ vật lý chạy thật (pose có y) và xe đã nằm yên trên mặt đất
async function ready(p: Page) {
  await p.waitForFunction(() => { const w = (window as unknown as { __world?: { pose: { current: { y?: number; speed: number } } } }).__world; return !!w && w.pose.current.y !== undefined && w.pose.current.y < 0.7; }, null, { timeout: 60000, polling: 200 }).catch(async (e) => {
    console.log("  [ready lỗi]", p.url(), await p.evaluate(() => { const w = (window as unknown as { __world?: { pose?: { current?: unknown } } }).__world; return w ? JSON.stringify(w.pose?.current ?? null) : "chưa có __world"; }).catch(() => "?"));
    await p.screenshot({ path: `${SHOTS}/dbg-world-ready.png`, timeout: 120000 }).catch(() => undefined);
    throw e;
  });
  await p.waitForTimeout(500);
}
async function openWorld(ctx: BrowserContext, at?: string) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => { console.log("  [pageerror]", e.message); fails++; });
  await p.goto(`${BASE}/world${at ? `?at=${at}` : ""}`);
  await ready(p);
  return p;
}

async function main() {
  const browser = await launch();   // e2e-lib: bỏ biến WSLg (WAYLAND_DISPLAY…) để Chrome headless khởi tạo được WebGL
  const mk = async (cookies: Awaited<ReturnType<typeof session>>) => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await c.addCookies(cookies);
    // giống e2e-lib: tắt nhạc nền YouTube (tốn CPU) và bảng điểm danh tự bật (che màn hình)
    await c.addInitScript(() => { try { localStorage.setItem("music", "off"); localStorage.setItem("lq:daily-auto", new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())); } catch { /* bỏ qua */ } });
    return c;
  };
  const A = await mk(await session("moheo@lovequest.local", "moheo-dev-2026", "Mỡ heo"));
  const B = await mk(await session("utdac@lovequest.local", "utdac-dev-2026", "Út đặc"));

  // --- Hub mặc định vào 3D (S03 Phase 7), ?view=2d thì ở lại 2D ---
  const h = await A.newPage();
  await h.goto(BASE + "/"); await h.waitForURL(/\/world/, { timeout: 30000 }).catch(() => {});
  check("Hub lần đầu tự vào thế giới 3D", h.url().includes("/world"), h.url());
  await h.goto(BASE + "/?view=2d"); await h.waitForTimeout(1500);
  await h.goto(BASE + "/"); await h.waitForTimeout(2500);
  check("đã chọn 2D thì Hub ở lại 2D (ghi nhớ)", !h.url().includes("/world"), h.url());
  await h.close();

  // --- lái cơ bản ---
  const p = await openWorld(A);
  console.log(`INFO  fps lúc đầu: ${(await fpsOf(p)).toFixed(0)}`);
  const s0 = await pose(p);
  check("xe đứng trên mặt đất lúc xuất phát", s0.y > 0.4 && s0.y < 1.0 && Math.abs(s0.speed) < 0.5, s0);
  await p.screenshot({ path: `${SHOTS}/1-start.png`, timeout: 120000 });
  await hold(p, ["ArrowUp"], 1200);
  const s1 = await pose(p);
  check("giữ ↑: xe tiến về phía trước (z giảm vì mũi xe hướng bắc)", s0.z - s1.z > 4 && Math.abs(s1.x - s0.x) < 1, { s0, s1 });
  await hold(p, ["KeyW", "KeyA"], 900);
  const s2 = await pose(p);
  check("W + A: xe rẽ trái (h tăng)", s2.h - s1.h > 0.5 || s2.h - s1.h < -5, { s1, s2 });
  await hold(p, ["Space"], 800);
  check("Space: phanh dừng xe", Math.abs((await pose(p)).speed) < 1);
  await p.keyboard.press("KeyR"); await p.waitForTimeout(500);
  const s3 = await pose(p);
  check("R: về điểm xuất phát", Math.hypot(s3.x - s0.x, s3.z - s0.z) < 1, s3);
  await p.screenshot({ path: `${SHOTS}/2-after-drive.png`, timeout: 120000 });

  // --- va chạm: lao thẳng vào Thư viện không xuyên qua ---
  await p.goto(`${BASE}/world?at=library`); await ready(p);
  await hold(p, ["ArrowUp", "ShiftLeft"], 4000);
  const c1 = await pose(p);
  // nhà Thư viện: tâm (-28,-12), nửa cạnh 3.6 x 2.9
  const inside = Math.abs(c1.x + 28) < 3.6 && Math.abs(c1.z + 12) < 2.9;
  check("đâm vào Thư viện: không xuyên tường", !inside, c1);
  check("đến gần Thư viện thì hiện khu 'library'", (await near(p)) === "library", await near(p));
  await p.screenshot({ path: `${SHOTS}/3-library.png`, timeout: 120000 });

  // --- E mở overlay 2D trên nền 3D (W3D-02, TC-30) ---
  await p.keyboard.press("KeyE");
  const frame = p.frameLocator(OVERLAY);
  await frame.locator("main").waitFor({ timeout: 30000 });
  check("E: overlay mở trang Thư viện trong khung", (await p.locator(OVERLAY).getAttribute("src")) === "/learn");
  await p.waitForTimeout(1500);
  const headerHidden = await frame.locator(".app-header").evaluate((e) => getComputedStyle(e).display === "none");
  check("trong overlay: thanh menu bị ẩn (chế độ nhúng)", headerHidden);
  check("nền 3D vẫn còn phía sau overlay", await p.locator("canvas").count() === 1);
  await p.screenshot({ path: `${SHOTS}/4-overlay.png`, timeout: 120000 });
  const before = await pose(p);
  await hold(p, ["ArrowUp"], 600);
  check("đang mở overlay thì phím không lái xe", Math.hypot((await pose(p)).x - before.x, (await pose(p)).z - before.z) < 0.5);
  await p.keyboard.press("Escape"); await p.waitForTimeout(800);
  check("Esc: đóng overlay", await p.locator(OVERLAY).count() === 0);

  // link về Hub bên trong overlay → đóng overlay chứ không lồng thế giới
  await p.locator("button", { hasText: "để vào" }).click({ force: true });
  await frame.locator("main").waitFor({ timeout: 30000 }); await p.waitForTimeout(1000);
  await frame.locator("body").evaluate(() => { const a = document.createElement("a"); a.href = "/"; a.id = "go-home"; a.textContent = "home"; document.body.prepend(a); });
  await frame.locator("#go-home").click(); await p.waitForTimeout(800);
  check("bấm link về Hub trong overlay → đóng overlay", await p.locator(OVERLAY).count() === 0);

  // --- dốc nhảy: xuất phát ngay trước dốc (?at=ramp), giữ ga + Shift ---
  await p.goto(`${BASE}/world?at=ramp`); await ready(p);
  let maxY = 0, shot = false;
  await p.keyboard.down("ArrowUp"); await p.keyboard.down("ShiftLeft");
  for (let i = 0; i < 200; i++) {
    const q = await pose(p); maxY = Math.max(maxY, q.y);
    if (q.y > 2.5 && !shot) { shot = true; await p.screenshot({ path: `${SHOTS}/5-jump.png`, timeout: 120000 }); }
    if (q.z > 54) break;
    await p.waitForTimeout(30);
  }
  await p.keyboard.up("ArrowUp"); await p.keyboard.up("ShiftLeft");
  check("dốc nhảy: xe bay lên cao (y > 2.5)", maxY > 2.5, { maxY, end: await pose(p) });
  await p.waitForTimeout(1500);
  const land = await pose(p);
  check("tiếp đất an toàn, vẫn trong bản đồ", land.y > 0.3 && land.y < 1.2 && Math.abs(land.z) < 58, land);

  // --- realtime: 2 người cùng vào làng thấy xe nhau (W3D-03) ---
  const q = await openWorld(B, "market");
  await hold(q, ["ArrowUp"], 800);
  await p.waitForTimeout(2500);
  const rem = await p.evaluate(() => (window as unknown as { __world: { remote: { current: { x: number; z: number } | null } } }).__world.remote.current);
  const bp = await pose(q);
  check("A nhận được vị trí xe của B qua Realtime", !!rem && Math.hypot(rem.x - bp.x, rem.z - bp.z) < 1.5, { rem, bp });
  await p.screenshot({ path: `${SHOTS}/6-partner.png`, timeout: 120000 });

  // --- điện thoại: joystick ảo lái được xe (W3D-01) ---
  const M = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await M.addCookies(await session("moheo@lovequest.local", "moheo-dev-2026", "Mỡ heo"));
  await M.addInitScript(() => { try { localStorage.setItem("music", "off"); localStorage.setItem("lq:daily-auto", new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())); } catch { /* bỏ qua */ } });
  const mp = await openWorld(M);
  const joy = mp.getByLabel("Cần điều khiển");
  check("điện thoại: hiện joystick ảo", await joy.isVisible());
  const m0 = await pose(mp);
  const box = (await joy.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const cdp = await M.newCDPSession(mp);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: cx, y }] });
  await touch("touchStart", cy);
  for (let i = 1; i <= 5; i++) { await touch("touchMove", cy - i * 12); await mp.waitForTimeout(30); }
  await mp.waitForTimeout(2500);
  const m1 = await pose(mp);
  await mp.screenshot({ path: `${SHOTS}/7-mobile.png`, timeout: 120000 });
  await touch("touchEnd", cy - 60);
  check("điện thoại: đẩy joystick lên thì xe tiến", m0.z - m1.z > 2, { m0, m1 });

  // --- khung hình/giây (SwiftShader chạy CPU nên chỉ để tham khảo) ---
  const fps = await fpsOf(p);
  console.log(`INFO  fps (CPU SwiftShader, không có GPU): ${fps.toFixed(0)}`);

  await browser.close();
  console.log(fails ? `\n${fails} FAIL` : "\nTẤT CẢ PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
