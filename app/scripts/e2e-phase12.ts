/* eslint-disable @typescript-eslint/no-explicit-any */
// E2E Phase 12 (điện thoại 390×844, DB test — XOÁ dữ liệu game): popup thông báo (vừa màn hình, chạm ngoài là đóng),
// chạm mô hình nhà / thú cưng → popup nâng cấp có nút ✕, xu cập nhật ngay không tải lại trang, khung nhạc nền.
import path from "node:path";
import { admin, resetGame, moheoLogin, utdacLogin, ensureOnboarded } from "./it-lib";
import { BASE, SHOTS, check, context, finish, launch, sessionCookies, watchErrors } from "./e2e-lib";

async function main() {
  await resetGame();
  const m = await moheoLogin(), u = await utdacLogin();
  await ensureOnboarded(m, "Mỡ heo"); await ensureOnboarded(u, "Út đặc");
  await admin.rpc("apply_coins", { p_user: m.id, p_amount: 5000, p_reason: "LEVEL_WIN" });
  await admin.from("user_house").update({ hp: 100 }).eq("user_id", m.id);               // nhà hỏng để thử Sửa
  await admin.from("user_pets").insert({ user_id: m.id, pet_code: "cat", nickname: "Mướp", level: 1 });
  await admin.from("inventory").upsert({ user_id: m.id, item_type: "PET_UPGRADE", quantity: 2 });
  await admin.rpc("notify", { p_user: m.id, p_type: "TEST", p_title: "Thông báo thử một tiêu đề khá dài để xem có tràn màn hình điện thoại không", p_body: "Nội dung thông báo cũng dài để kiểm tra xuống dòng đúng" }).then(() => undefined, () => undefined);

  const b = await launch();
  const c = await context(b, await sessionCookies("moheo@lovequest.local", "moheo-dev-2026"), true);
  const p = await c.newPage(); watchErrors(p, "điện thoại");
  const shot = (n: string) => p.screenshot({ path: path.join(SHOTS, `p12-${n}.png`) });
  const coinsText = async () => Number((await p.getByTestId("coins").innerText()).replace(/[^\d]/g, ""));

  // ---- popup thông báo ----
  await p.goto(`${BASE}/battles`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await p.getByLabel(/Thông báo/).first().click();
  const panel = p.getByTestId("notif-panel");
  await panel.waitFor({ timeout: 30000 });
  const bx = (await panel.boundingBox())!;
  check(`Popup thông báo nằm gọn trong màn hình (x=${Math.round(bx.x)}, rộng ${Math.round(bx.width)} / 390)`, bx.x >= 0 && bx.x + bx.width <= 390);
  await shot("1-notif");
  await p.mouse.click(195, 800);   // chạm ra ngoài
  await p.waitForTimeout(400);
  check("Chạm ra ngoài → popup thông báo đóng", (await panel.count()) === 0);
  await p.getByLabel(/Thông báo/).first().click(); await panel.waitFor();
  await p.getByTestId("notif-panel").getByLabel("Đóng").click(); await p.waitForTimeout(300);
  check("Nút ✕ đóng popup thông báo", (await panel.count()) === 0);
  check("Nhạc nền: trình phát ẩn + nút loa trên thanh trên", (await p.getByTestId("music").count()) === 1 && (await p.getByTestId("music-toggle").isVisible()) && ((await p.getByTestId("music").boundingBox())?.width ?? 9) <= 1);
  await p.getByTestId("music-toggle").click(); await p.waitForTimeout(200);
  check("Bấm loa → 🔇 (tắt nhạc)", (await p.getByTestId("music-toggle").innerText()).includes("🔇"));
  await p.getByTestId("music-toggle").click(); await p.waitForTimeout(200);

  // ---- căn cứ: chạm nhà → popup → Sửa nhà, xu đổi ngay ----
  await p.goto(`${BASE}/base`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await p.waitForFunction(() => (window as any).__base?.placed, null, { timeout: 180000 });
  await p.waitForTimeout(3000);
  const canvas = (await p.getByTestId("base-scene").locator("canvas").boundingBox())!;
  const tap = async (pt: { x: number; y: number }) => p.mouse.click(canvas.x + pt.x, canvas.y + pt.y);
  const c0 = await coinsText();
  const housePt = await p.evaluate(() => (window as any).__base.projectM(0, 0));
  await tap({ x: housePt.x, y: housePt.y - 25 });
  await p.getByTestId("object-panel").waitFor({ timeout: 30000 });
  check("Chạm nhà → popup nhà (HP, Sửa, Nâng cấp)", (await p.getByTestId("object-panel").innerText()).includes("Sửa hết"));
  await shot("2-house-panel");
  await p.getByTestId("repair-full").click();
  await p.getByTestId("object-panel").getByRole("status").waitFor({ timeout: 30000 });
  await p.waitForFunction((v) => Number(document.querySelector('[data-testid="coins"]')?.textContent?.replace(/[^\d]/g, "")) < v, c0, { timeout: 15000 }).catch(() => undefined);
  const c1 = await coinsText();
  check(`Sửa nhà → xu trên thanh trên giảm ngay (${c0} → ${c1}, không tải lại trang)`, c1 === c0 - (200 - 100) * 2, { c0, c1 });   // nhà cấp 0: 200 HP tối đa, đang 100 → 100 HP × 2 xu
  await p.getByTestId("panel-close").click(); await p.waitForTimeout(300);
  check("Nút ✕ đóng popup nhà", (await p.getByTestId("object-panel").count()) === 0);

  // ---- chạm thú cưng → nâng cấp ----
  const pet = await p.evaluate(() => (window as any).__base.placed.find((x: any) => x.kind === "PET"));
  const petPt = await p.evaluate(([x, z]) => (window as any).__base.project(x, z, 1), [pet.x, pet.z]);
  await tap({ x: petPt.x, y: petPt.y - 12 });
  await p.getByTestId("object-panel").waitFor({ timeout: 30000 });
  check("Chạm thú cưng → popup thú cưng có nút nâng cấp", (await p.getByTestId("upgrade-pet").count()) === 1);
  await p.getByTestId("upgrade-pet").click();
  await p.getByTestId("object-panel").getByRole("status").waitFor({ timeout: 30000 });
  await p.waitForTimeout(1500);
  const lv = (await admin.from("user_pets").select("level").eq("user_id", m.id).single()).data!.level;
  const c2 = await coinsText();
  check(`Nâng cấp Mướp lên cấp 2 (−100 xu, xu hiển thị ${c1} → ${c2})`, lv === 2 && c2 === c1 - 100, { lv, c1, c2 });
  await shot("3-pet-panel");
  await p.getByTestId("panel-close").click(); await p.waitForTimeout(300);

  // ---- 1 màn hình, không phải cuộn, không thừa khoảng trắng; khiên & túi đồ là popup ----
  const sc = await p.evaluate(() => {
    const v = document.querySelector('[data-testid="base-view"]')!.getBoundingClientRect();
    return { h: document.documentElement.scrollHeight, v: window.innerHeight, gap: Math.round(window.innerHeight - v.bottom) };
  });
  check(`Căn cứ vừa 1 màn hình điện thoại (cao ${sc.h} / ${sc.v}), dưới khung 3D chỉ còn lề ${sc.gap}px`, sc.h <= sc.v + 1 && sc.gap <= 40, sc);
  // ---- FPS: chỉ hiện số FPS, góc dưới trái, không đè nút ----
  await p.evaluate(() => localStorage.setItem("show_fps", "1"));
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => (window as any).__base?.placed, null, { timeout: 180000 });
  await p.waitForTimeout(2500);
  const fpsText = await p.getByTestId("fps").innerText();
  check(`FPS chỉ hiện số: "${fpsText}"`, /^\d+ FPS$/.test(fpsText.trim()));
  const fb = (await p.getByTestId("fps").boundingBox())!;
  let fpsClash = 0;
  for (const bt of await p.getByTestId("base-scene").locator("button").all()) { const bb = await bt.boundingBox(); if (bb && fb.x < bb.x + bb.width && bb.x < fb.x + fb.width && fb.y < bb.y + bb.height && bb.y < fb.y + fb.height) fpsClash++; }
  check("Ô FPS không đè lên nút nào", fpsClash === 0, { fb });
  await shot("4b-fps");
  await p.evaluate(() => localStorage.setItem("show_fps", "0"));
  for (const [btn, word] of [["open-shield", "Khiên"], ["open-bag", "quân"]] as const) {
    await p.getByTestId(btn).click();
    await p.getByTestId("extra-panel").waitFor({ timeout: 10000 });
    check(`Nút ${btn} → popup ${word}`, (await p.getByTestId("extra-panel").innerText()).includes(word));
    await shot(`4-${btn}`);
    await p.getByTestId("extra-panel").getByTestId("panel-close").click(); await p.waitForTimeout(300);
  }

  // ---- mua tường → tường hiện quanh nhà ngay ----
  const w0 = await p.evaluate(() => (window as any).__base.placed.filter((x: any) => x.kind === "WALL").length);
  const r = await m.c.rpc("buy_walls", { p_qty: 5 });
  check("Mua 5 đoạn tường", !r.error, r.error);
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => (window as any).__base?.placed, null, { timeout: 180000 });
  const w1 = await p.evaluate(() => (window as any).__base.placed.filter((x: any) => x.kind === "WALL").length);
  check(`Tường mới tự xây quanh nhà (${w0} → ${w1})`, w1 === w0 + 5, { w0, w1 });
  await p.waitForTimeout(2500); await shot("5-walls");

  // ---- chế độ Xây dựng → Tường: thanh nút và thông báo không chồng lên nhau ----
  const overlap = (a: { x: number; y: number; width: number; height: number }, b2: { x: number; y: number; width: number; height: number }) =>
    a.x < b2.x + b2.width && b2.x < a.x + a.width && a.y < b2.y + b2.height && b2.y < a.y + a.height;
  await p.getByTestId("edit-base").click();
  await p.getByTestId("wall-mode").click();
  await p.getByTestId("scene-msg").waitFor({ timeout: 10000 });
  const btns = await p.getByTestId("edit-toolbar").locator("button").all();
  const msgBox = (await p.getByTestId("scene-msg").boundingBox())!;
  let clash = 0; const rows = new Set<number>();
  for (const bt of btns) { const bb = (await bt.boundingBox())!; rows.add(Math.round(bb.y)); if (overlap(bb, msgBox)) clash++; }
  check(`Xây dựng → Tường: ${btns.length} nút trên ${rows.size} hàng, thông báo không đè nút`, clash === 0 && rows.size === 1, { clash, rows: [...rows] });
  const tray = (await p.getByTestId("tray").boundingBox())!;
  check("Thông báo không đè khay vật phẩm dưới đáy", !overlap(msgBox, tray));
  await shot("6-edit-walls");
  await p.getByTestId("wall-ring").click();
  await p.waitForTimeout(300);
  check("Bấm Bao quanh nhà → 1 thông báo duy nhất", (await p.getByTestId("scene-msg").count()) === 1);
  await p.waitForTimeout(5500);
  check("Thông báo tự ẩn sau vài giây", (await p.getByTestId("scene-msg").count()) === 0);
  await c.close();

  // ---- Phase 13: điểm danh & nhiệm vụ (DAY-01..03) ----
  const c13 = await context(b, await sessionCookies("moheo@lovequest.local", "moheo-dev-2026"), true, true);
  const q = await c13.newPage(); watchErrors(q, "thưởng ngày");
  await q.goto(`${BASE}/battles`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await q.getByTestId("daily-panel").waitFor({ timeout: 30000 });
  check("Lần đầu trong ngày: bảng điểm danh tự bật", true);
  const dp = (await q.getByTestId("daily-panel").boundingBox())!;
  check(`Bảng điểm danh nằm gọn màn hình điện thoại (${Math.round(dp.x)}..${Math.round(dp.x + dp.width)}, cao ${Math.round(dp.height)})`, dp.x >= 0 && dp.x + dp.width <= 390 && dp.y >= 0 && dp.y + dp.height <= 844);
  await q.screenshot({ path: path.join(SHOTS, "p13-1-login.png") });
  const k0 = Number((await q.getByTestId("coins").innerText()).replace(/[^\d]/g, ""));
  await q.getByTestId("claim-login").click();
  await q.getByTestId("daily-panel").getByRole("status").waitFor({ timeout: 30000 });
  await q.waitForTimeout(1500);
  const k1 = Number((await q.getByTestId("coins").innerText()).replace(/[^\d]/g, ""));
  check(`Điểm danh ngày 1 → +250 xu ngay (${k0} → ${k1})`, k1 === k0 + 250, { k0, k1 });
  check("Nút điểm danh chuyển sang 'Đã điểm danh'", (await q.getByTestId("claim-login").innerText()).includes("Đã điểm danh"));
  // nhiệm vụ: ôn 10 từ rồi nhận
  const words = (await admin.from("words").select("id").eq("level_id", (await admin.from("levels").select("id").eq("order_no", 1).single()).data!.id).limit(10)).data!;
  for (const w of words) await m.c.rpc("mark_word", { p_word: w.id, p_known: true });
  await q.getByTestId("daily-tab-quests").click();
  await q.getByTestId("claim-study10").waitFor({ timeout: 30000 });
  await q.screenshot({ path: path.join(SHOTS, "p13-2-quests.png") });
  await q.getByTestId("claim-study10").click();
  await q.getByTestId("quest-study10").getByText("Đã nhận").waitFor({ timeout: 30000 });
  check("Nhiệm vụ Ôn 10 từ: bấm Nhận → ✅ Đã nhận", true);
  await q.getByTestId("daily-backdrop").click({ position: { x: 5, y: 5 } });
  await q.waitForTimeout(300);
  check("Chạm ngoài → đóng bảng thưởng", (await q.getByTestId("daily-panel").count()) === 0);
  await q.reload({ waitUntil: "domcontentloaded" }); await q.waitForTimeout(3000);
  check("Mở lại trong ngày: không tự bật nữa", (await q.getByTestId("daily-panel").count()) === 0);

  // ---- Mưa chữ trên điện thoại: khung chơi phủ đúng vùng nhìn thấy, ô nhập sát đáy (bàn phím mở thì vùng này co lại) ----
  await q.goto(`${BASE}/learn/typing`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await q.getByRole("button", { name: "Bắt đầu" }).click();
  await q.getByTestId("typing-play").waitFor({ timeout: 30000 });
  await q.waitForTimeout(800);
  const tp = await q.evaluate(() => {
    const box = document.querySelector('[data-testid="typing-play"]')!.getBoundingClientRect();
    const inp = document.querySelector('input[aria-label="Nghĩa tiếng Việt"]')!.getBoundingClientRect();
    return { top: Math.round(box.top), h: Math.round(box.height), vh: Math.round(window.visualViewport!.height), gap: Math.round(box.bottom - inp.bottom), pos: getComputedStyle(document.querySelector('[data-testid="typing-play"]')!).position };
  });
  check(`Mưa chữ: khung chơi phủ vùng nhìn thấy (${tp.h}/${tp.vh}px), ô nhập cách đáy ${tp.gap}px`, tp.pos === "fixed" && tp.top === 0 && Math.abs(tp.h - tp.vh) <= 1 && tp.gap <= 16, tp);
  await q.screenshot({ path: path.join(SHOTS, "p15-typing.png") });
  await q.getByRole("button", { name: "Kết thúc" }).click();
  await q.waitForTimeout(1500);

  // ---- Phase 14: ngữ pháp trên điện thoại (GRM-01..03) ----
  await q.goto(`${BASE}/grammar`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await q.getByTestId("grammar-be-verb").waitFor({ timeout: 60000 });
  check(`Trang Ngữ pháp có ${await q.locator('[data-testid^="grammar-"]').count()} bài`, (await q.locator('[data-testid^="grammar-"]').count()) >= 24);
  await q.getByTestId("grammar-be-verb").click();
  await q.getByTestId("grammar-start").waitFor({ timeout: 60000 });
  await q.screenshot({ path: path.join(SHOTS, "p14-1-lesson.png"), fullPage: true });
  for (const r of ["0.5", "0.75", "1"]) check(`Có nút tốc độ đọc ${r}x`, (await q.getByTestId(`speed-${r}`).count()) === 1);
  await q.getByTestId("speed-0.75").click();
  check("Chọn 0.75x → lưu lại", (await q.evaluate(() => localStorage.getItem("tts_rate_grammar"))) === "0.75");
  await q.getByTestId("grammar-start").click();
  for (let i = 0; i < 10; i++) {
    await q.getByTestId("grammar-opt-0").click();
    await q.getByRole("status").waitFor({ timeout: 30000 });
    if (i === 0) await q.screenshot({ path: path.join(SHOTS, "p14-2-question.png") });
    if (i < 9) await q.getByTestId("grammar-next").click(); else await q.getByTestId("grammar-finish").click();
  }
  const res = await q.getByTestId("grammar-result").innerText({ timeout: 30000 });
  check(`Làm hết 10 câu → kết quả "${res}"`, /Đúng \d+\/10/.test(res));
  const sw = await q.evaluate(() => document.documentElement.scrollWidth);
  check(`Trang ngữ pháp không tràn ngang (rộng ${sw})`, sw <= 390);
  await q.screenshot({ path: path.join(SHOTS, "p14-3-result.png") });
  await b.close();
  finish();
}
main().catch((e) => { console.error(e); process.exit(1); });
