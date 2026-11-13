// Smoke test HTTP có đăng nhập thật. Chạy với server đã bật (SMOKE_BASE, mặc định :3100) và IT_ENV trỏ cùng DB với server.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", process.env.IT_ENV ?? ".env.local"), quiet: true });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3100";
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function login(email: string, password: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const name = `sb-${new globalThis.URL(URL).hostname.split(".")[0]}-auth-token`;
  const parts: string[] = [];
  for (let i = 0; i * 3180 < value.length; i++) parts.push(value.slice(i * 3180, (i + 1) * 3180));
  return { cookie: parts.length === 1 ? `${name}=${value}` : parts.map((p, i) => `${name}.${i}=${p}`).join("; "), id: data.user!.id, c };
}
let fails = 0, total = 0;
async function get(label: string, p: string, cookie: string, expect: { status?: number; has?: string[]; not?: string[]; loc?: string }) {
  total++;
  const r = await fetch(BASE + p, { headers: { cookie }, redirect: "manual" });
  const body = await r.text();
  const miss = (expect.has ?? []).filter((s) => !body.includes(s));
  const bad = (expect.not ?? []).filter((s) => body.includes(s));
  const good = r.status === (expect.status ?? 200) && !miss.length && !bad.length && (!expect.loc || (r.headers.get("location") ?? "").includes(expect.loc));
  console.log(`${good ? "PASS" : "FAIL"}  ${label}  [${r.status}${r.headers.get("location") ? " → " + r.headers.get("location") : ""}]`, good ? "" : { miss, bad, body: body.slice(0, 200) });
  if (!good) fails++;
}
async function main() {
  const m = await login("moheo@lovequest.local", "moheo-dev-2026");
  const u = await login("utdac@lovequest.local", "utdac-dev-2026");
  for (const x of [m, u]) await x.c.rpc("complete_onboarding", { p_name: x === m ? "Mỡ heo" : "Út đặc", p_color: "#ec4899" });
  const { data: att } = await admin.from("attacks").select("id").limit(1);
  const { data: ap } = await admin.from("level_attempts").select("id,user_id,level_id").eq("user_id", m.id).eq("mode", "PRACTICE").limit(1);
  const lvl1 = (await admin.from("levels").select("id").eq("order_no", 1).single()).data!.id;
  const { data: practice } = await m.c.rpc("start_attempt", { p_level: lvl1, p_mode: "PRACTICE" }).then((r) => r);
  void ap;

  await get("chưa đăng nhập → /login", "/", "", { status: 307, loc: "/login" });
  await get("Hub", "/", m.cookie, { has: ["Love Quest", "Mỡ heo", "Mưa chữ", "Căn cứ"] });
  await get("Hub: ADMIN thấy menu Admin", "/", u.cookie, { has: ["/admin/levels"] });
  await get("Hub: PLAYER không thấy menu Admin", "/", m.cookie, { not: ["/admin/levels"] });
  await get("Bản đồ màn", "/levels", m.cookie, { has: ["Bản đồ màn chơi", "Greetings", "Chào hỏi"] });
  await get("Chi tiết màn 1", "/levels/1", m.cookie, { has: ["Phần thưởng", "Học trước", "Luyện tập"] });
  await get("Chi tiết màn khóa", "/levels/9", m.cookie, { has: ["chưa mở", "sẽ mở khi màn trước đóng"] });
  await get("Màn chơi (luyện tập)", `/levels/1/play?attempt=${practice}&practice=1`, m.cookie, { has: ["Đang tải"] });
  await get("Màn chơi không có attempt → chi tiết", "/levels/1/play", m.cookie, { status: 307, loc: "/levels/1" });
  await get("Đối đầu", "/rivalry", m.cookie, { has: ["Bảng đối đầu"] });
  await get("Thư viện học + Mưa chữ", "/learn", m.cookie, { has: ["Thư viện chủ đề", "Mưa chữ"] });
  await get("Mưa chữ", "/learn/typing", m.cookie, { has: ["Mưa chữ", "Bắt đầu", "Kỷ lục"] });
  await get("Flashcard ôn từ sai (?only)", "/learn/1?only=x", m.cookie, { has: ["chưa có từ vựng"] });
  await get("Căn cứ", "/base", m.cookie, { has: ["Căn cứ của", "Thăm nhà người ấy", "Thú cưng", "Quân đội"] });
  await get("Nhà người ấy", "/base/partner", m.cookie, { has: ["Nhà của", "Tấn công"] });
  for (const tab of ["pets", "house", "units", "weapons", "shield"]) await get(`Cửa hàng tab ${tab}`, `/shop?tab=${tab}`, m.cookie, { has: ["Cửa hàng"] });
  await get("Cửa hàng: thú cưng có giá", "/shop?tab=pets", m.cookie, { has: ["Mèo mướp", "Chó Corgi", "Cú mèo"] });
  await get("Nhật ký chiến trận", "/battles", m.cookie, { has: ["Nhật ký chiến trận"] });
  if (att?.length) await get("Hoạt cảnh trận", `/battle/${att[0].id}`, m.cookie, { has: ["Bỏ qua"] });
  await get("Trận không tồn tại → 404", "/battle/00000000-0000-0000-0000-000000000000", m.cookie, { status: 404 });
  await get("Profile + thống kê", `/profile/${m.id}`, m.cookie, { has: ["Từ đã thuộc", "Màn thắng"] });
  await get("TC-03 PLAYER vào /admin → 403", "/admin/levels", m.cookie, { status: 307, loc: "/403" });
  await get("TC-03 PLAYER vào /admin/config → 403", "/admin/config", m.cookie, { status: 307, loc: "/403" });
  await get("ADMIN: màn & từ vựng", "/admin/levels", u.cookie, { has: ["Admin", "Greetings"] });
  await get("ADMIN: sửa màn 1", "/admin/levels/1", u.cookie, { has: ["Import CSV", "hello"] });
  await get("ADMIN: cấu hình", "/admin/config", u.cookie, { has: ["LEVEL_LOCK_HOURS", "SHIELD_PRICE"] });
  await get("Sổ từ vựng", "/words", m.cookie, { has: ["Sổ từ vựng"] });
  await get("Cài đặt", "/settings", m.cookie, { has: ["Cài đặt", "Âm thanh"] });
  await get("Thế giới 3D", "/world", m.cookie, { has: ["Làng Tình Yêu"] });
  console.log(fails ? `\n${fails}/${total} FAIL` : `\nTất cả ${total} PASS`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
