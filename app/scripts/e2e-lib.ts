// Tiện ích E2E dùng chung (Playwright + Chrome headless thật, WebGL SwiftShader)
import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright";
config({ path: path.resolve(__dirname, "..", process.env.IT_ENV ?? ".env.local"), quiet: true });
export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3101";
export const SHOTS = process.env.E2E_SHOTS ?? path.resolve(__dirname, "..", ".e2e-shots");
fs.mkdirSync(SHOTS, { recursive: true });

let fails = 0;
export const check = (label: string, ok: boolean, info?: unknown) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`, ok ? "" : JSON.stringify(info) ?? ""); if (!ok) fails++; return ok; };
export const failCount = () => fails;
export const finish = () => { console.log(fails ? `\n${fails} FAIL` : "\nTẤT CẢ PASS"); process.exit(fails ? 1 : 0); };

/** Cookie phiên đăng nhập Supabase cho trình duyệt (đăng nhập thật bằng mật khẩu) */
export async function sessionCookies(email: string, password: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw error;
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const cname = `sb-${new globalThis.URL(URL).hostname.split(".")[0]}-auth-token`;
  const parts: string[] = []; for (let i = 0; i * 3180 < value.length; i++) parts.push(value.slice(i * 3180, (i + 1) * 3180));
  const host = new globalThis.URL(BASE).hostname;
  return parts.length === 1 ? [{ name: cname, value, domain: host, path: "/" }] : parts.map((v, i) => ({ name: `${cname}.${i}`, value: v, domain: host, path: "/" }));
}
// WSLg đặt WAYLAND_DISPLAY/DISPLAY: Chrome headless sẽ đòi VK_KHR_wayland_surface và KHÔNG khởi tạo được WebGL → bỏ 2 biến đó
const cleanEnv = () => { const e: Record<string, string> = {}; for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== "WAYLAND_DISPLAY" && k !== "DISPLAY" && k !== "XDG_SESSION_TYPE") e[k] = v; return e; };
export const launch = () => chromium.launch({ env: cleanEnv(), args: ["--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
export async function context(browser: Browser, cookies?: Awaited<ReturnType<typeof sessionCookies>>, mobile = false, dailyPopup = false) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 860 } });
  if (cookies) await c.addCookies(cookies);
  // bảng điểm danh tự bật (DAY-01) che trang → các test khác coi như đã xem hôm nay
  // nhạc nền YouTube (trình phát ẩn) tốn CPU giải mã video trên Chrome không GPU → tắt trong test
  await c.addInitScript(() => { try { localStorage.setItem("music", "off"); } catch { /* bỏ qua */ } });
  if (!dailyPopup) await c.addInitScript(() => { try { localStorage.setItem("lq:daily-auto", new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())); } catch { /* bỏ qua */ } });
  return c;
}
/** Bắt lỗi JS trên trang: lỗi nào cũng là FAIL */
export function watchErrors(p: Page, label: string) {
  p.on("pageerror", (e) => check(`[${label}] không có lỗi JS: ${e.message.slice(0, 160)}`, false));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|Download the React DevTools|WebGL|GPU stall|net::ERR|Failed to load resource/.test(m.text())) console.log(`  [console.error ${label}]`, m.text().slice(0, 200)); });
}

/** BTL-01: bước chọn quân — chọn hết mọi loại lính rồi Xuất quân */
export async function pickAllAndGo(p: import("playwright").Page) {
  await p.getByTestId("army-picker").waitFor({ timeout: 30000 });
  for (const card of await p.locator('[data-testid^="pick-"]').all()) {
    const id = await card.getAttribute("data-testid");
    if (!id || ["pick-minus", "pick-plus", "pick-all", "pick-count"].includes(id)) continue;
    await card.click(); await p.getByTestId("pick-all").click();
  }
  await p.getByTestId("army-go").click();
}
