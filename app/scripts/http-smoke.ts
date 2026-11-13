// Smoke test HTTP có đăng nhập thật: gọi từng trang như trình duyệt (cookie phiên @supabase/ssr). Cần server chạy ở :3100.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", process.env.IT_ENV ?? ".env.local"), quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BASE = "http://localhost:3100";

async function cookieFor(email: string, password: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const name = `sb-${new globalThis.URL(URL).hostname.split(".")[0]}-auth-token`;
  const parts: string[] = [];
  for (let i = 0; i * 3180 < value.length; i++) parts.push(value.slice(i * 3180, (i + 1) * 3180));
  const cookie = parts.length === 1 ? `${name}=${value}` : parts.map((p, i) => `${name}.${i}=${p}`).join("; ");
  return { cookie, id: data.user!.id };
}
let fails = 0;
async function get(label: string, p: string, cookie: string, expect: { status: number; has?: string[]; loc?: string }) {
  const r = await fetch(BASE + p, { headers: { cookie }, redirect: "manual" });
  const body = await r.text();
  const miss = (expect.has ?? []).filter((s) => !body.includes(s));
  const good = r.status === expect.status && !miss.length && (!expect.loc || (r.headers.get("location") ?? "").includes(expect.loc));
  console.log(`${good ? "PASS" : "FAIL"}  ${label}  [${r.status}${r.headers.get("location") ? " → " + r.headers.get("location") : ""}]`, good ? "" : { miss, body: body.slice(0, 300) });
  if (!good) fails++;
}
async function main() {
  const m = await cookieFor("moheo@lovequest.local", "moheo-dev-2026");
  const u = await cookieFor("utdac@lovequest.local", "utdac-dev-2026");
  // đảm bảo Út đặc đã onboarding (idempotent)
  const au = createClient(URL, ANON, { auth: { persistSession: false } });
  await au.auth.signInWithPassword({ email: "utdac@lovequest.local", password: "utdac-dev-2026" });
  await au.rpc("complete_onboarding", { p_name: "Út đặc", p_color: "#3b82f6" });
  await get("không đăng nhập → /login", "/", "", { status: 307, loc: "/login" });
  await get("Hub", "/", m.cookie, { status: 200, has: ["Love Quest", "Mỡ heo", "Học trước"] });
  await get("Hub hiện người ấy", "/", m.cookie, { status: 200, has: ["Út đặc", "bên nhau"] });
  await get("Thư viện học", "/learn", m.cookie, { status: 200, has: ["Greetings", "Khóa"] });
  await get("Flashcard màn 1", "/learn/1", m.cookie, { status: 200, has: ["hello"] });
  await get("Flashcard màn KHÓA → thư viện", "/learn/4", m.cookie, { status: 307, loc: "/learn" });
  await get("Profile mình", `/profile/${m.id}`, m.cookie, { status: 200, has: ["Mỡ heo", "Sửa hồ sơ", "Từ đã thuộc"] });
  await get("Profile người ấy (không có nút sửa)", `/profile/${u.id}`, m.cookie, { status: 200, has: ["Út đặc"] });
  await get("Sửa profile", "/profile/edit", m.cookie, { status: 200, has: ["Sửa hồ sơ", "Tên hiển thị"] });
  await get("Cài đặt", "/settings", m.cookie, { status: 200, has: ["Cài đặt", "Đổi mật khẩu"] });
  await get("TC-03 PLAYER vào /admin → 403", "/admin/levels", m.cookie, { status: 307, loc: "/403" });
  await get("ADMIN vào /admin", "/admin/levels", u.cookie, { status: 200, has: ["Admin", "Greetings"] });
  await get("ADMIN sửa màn 1", "/admin/levels/1", u.cookie, { status: 200, has: ["Import CSV", "hello"] });
  await get("ADMIN thấy menu Admin", "/", u.cookie, { status: 200, has: ["/admin/levels"] });
  console.log(fails ? `\n${fails} FAIL` : "\nTất cả PASS");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
