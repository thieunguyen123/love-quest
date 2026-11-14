/* eslint-disable @typescript-eslint/no-explicit-any */
// TEST THÔNG LUỒNG toàn game bằng trình duyệt thật (2 người chơi cùng lúc), chạy trên DB TEST (xoá sạch dữ liệu game!).
// Mỡ heo = A (PLAYER), Út đặc = B (ADMIN). Câu hỏi được trả lời qua giao diện; đáp án đúng tra trong DB (A đúng hết, B sai hết).
// Chạy: bật server test :3101 rồi `npm run test:flow`
import type { Page, BrowserContext } from "playwright";
import { admin, resetGame } from "./it-lib";
import { BASE, SHOTS, check, finish, launch, context, sessionCookies, watchErrors } from "./e2e-lib";

const shot = (p: Page, n: string) => p.screenshot({ path: `${SHOTS}/flow-${n}.png` }).catch(() => undefined);
const uid = async (email: string) => (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email)!.id;
const coins = async (id: string) => (await admin.from("profiles").select("coins").eq("id", id).single()).data!.coins as number;
const level = async (n: number) => (await admin.from("levels").select("*").eq("order_no", n).single()).data!;
const house = async (id: string) => (await admin.from("user_house").select("*").eq("user_id", id).maybeSingle()).data;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mở trang: không được 5xx, không hiện màn lỗi */
async function go(p: Page, path: string, label = path) {
  const r = await p.goto(BASE + path, { timeout: 120000, waitUntil: "domcontentloaded" });
  const status = r?.status() ?? 0;
  await p.waitForLoadState("load").catch(() => undefined);
  const body = await p.locator("body").innerText().catch(() => "");
  const bad = /Runtime Error|Unhandled Runtime|Application error|Internal Server Error|This page could not be found/.test(body);
  check(`mở ${label} không lỗi (HTTP ${status})`, status < 500 && !bad, { status, body: body.slice(0, 300) });
}

async function onboard(p: Page, name: string, colorIdx: number) {
  await go(p, "/");
  await p.waitForURL(/onboarding/, { timeout: 120000, waitUntil: "commit" });
  check(`${name}: lần đầu vào bị chuyển tới onboarding`, p.url().includes("/onboarding"));
  await p.getByPlaceholder("Tên hiển thị (2–20 ký tự)").fill(name);
  await p.getByRole("button", { name: "Tiếp tục" }).click();
  await p.getByRole("button", { name: /Dùng avatar mặc định|Tiếp tục/ }).click();
  await p.locator('button[aria-label^="Màu "]').nth(colorIdx).click();
  await p.getByRole("button", { name: "Hoàn tất" }).click();
  await p.getByRole("button", { name: "Vào game" }).click();
  await p.waitForURL(/\/world/, { timeout: 90000, waitUntil: "commit" }).catch(async (e) => {
    await shot(p, `dbg-onboard-${name}`);
    console.log("URL", p.url(), "view=", await p.evaluate(() => localStorage.getItem("view")), "BODY", (await p.locator("body").innerText()).slice(0, 400));
    throw e;
  });
  check(`${name}: hoàn tất hồ sơ → Hub tự vào thế giới 3D`, p.url().includes("/world"));
}

/** Trang đang rảnh → về trang trống để không giành CPU (Chrome headless không có GPU, chỉ ~7 FPS) */
const idle = (p: Page) => p.goto("about:blank").catch(() => undefined);

async function worldReady(p: Page) {
  await p.waitForFunction(() => { const w = (window as any).__world; return !!w && w.pose.current.y !== undefined && w.pose.current.y < 0.8; }, null, { timeout: 120000, polling: 250 });
  await p.waitForTimeout(500);
}

// ---------- chơi 1 lượt màn (trả lời qua UI, tra đáp án trong DB) ----------
async function playLevel(p: Page, order: number, mode: "RANKED" | "PRACTICE", correct: boolean) {
  const lv = await level(order);
  const { data: words } = await admin.from("words").select("word,meanings_vi").eq("level_id", lv.id);
  const viOf = new Map((words ?? []).map((w: any) => [w.word.toLowerCase(), (w.meanings_vi as string[]).map((m) => m.toLowerCase())]));
  const enOfVi = (vi: string) => (words ?? []).find((w: any) => (w.meanings_vi as string[]).some((m) => m.toLowerCase() === vi.toLowerCase()))?.word as string | undefined;
  let q: any = null;
  const onResp = async (r: any) => { if (r.url().includes("/rpc/next_question")) { try { const j = await r.json(); if (!j.finished) q = j; } catch { /* ignore */ } } };
  p.on("response", onResp);
  p.once("dialog", (d) => d.accept());
  await go(p, `/levels/${order}`);
  await p.getByRole("button", { name: mode === "RANKED" ? /Bắt đầu thi đấu|Chơi tiếp/ : /Luyện tập/ }).click();
  await p.waitForURL(/\/play/, { timeout: 120000, waitUntil: "commit" });
  const types = new Set<string>();
  let answered = 0, lastIdx = -1;
  for (let guard = 0; guard < 60 && !p.url().includes("/result"); guard++) {
    await p.waitForTimeout(400);
    if (!q || q.index === lastIdx) continue;
    const cur = q; lastIdx = cur.index; types.add(cur.type);
    const qs = cur.question;
    await p.getByText(`Câu ${cur.index + 1}/${cur.total}`).waitFor({ timeout: 20000 });
    let ans: string | undefined;
    if (cur.type === "MC_EN_VN") ans = qs.options.find((o: string) => (viOf.get(String(qs.prompt).toLowerCase()) ?? []).includes(o.toLowerCase()));
    if (cur.type === "MC_VN_EN" || cur.type === "FILL") ans = enOfVi(qs.prompt);
    if (cur.type === "LISTEN") ans = qs.speak;
    if (["MC_EN_VN", "MC_VN_EN", "FILL", "LISTEN"].includes(cur.type)) {
      const pick = correct ? ans : qs.options.find((o: string) => o.toLowerCase() !== String(ans).toLowerCase());
      await p.locator("button", { hasText: new RegExp(`^\\d${pick!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first().click();
    } else if (cur.type === "SPELL") {
      await p.getByLabel("Từ tiếng Anh").fill(correct ? (enOfVi(qs.prompt) ?? "x") : "sai");
      await p.getByLabel("Từ tiếng Anh").press("Enter");
    } else if (cur.type === "MATCH") {
      for (let i = 0; i < 4; i++) {
        const en = qs.pairs_en[i] as string;
        const j = correct ? qs.pairs_vi.findIndex((v: string) => (viOf.get(en.toLowerCase()) ?? []).includes(v.toLowerCase())) : (i + 1) % 4;
        await p.locator("button", { hasText: en }).first().click();
        await p.locator("button", { hasText: qs.pairs_vi[j] }).first().click();
      }
    }
    answered++;
    await p.getByRole("status").first().waitFor({ timeout: 15000 }).catch(() => undefined);
    const fb = await p.getByRole("status").first().innerText().catch(() => "");
    if (correct) check(`  câu ${cur.index + 1} (${cur.type}) trả lời đúng`, fb.includes("✅"), fb);
  }
  await p.waitForURL(/\/result/, { timeout: 120000, waitUntil: "commit" });
  p.off("response", onResp);
  return { answered, types };
}

async function main() {
  await resetGame();
  const A_ID = await uid("moheo@lovequest.local"), B_ID = await uid("utdac@lovequest.local");
  const browser = await launch();
  const A: BrowserContext = await context(browser, await sessionCookies("moheo@lovequest.local", "moheo-dev-2026"));
  const B: BrowserContext = await context(browser, await sessionCookies("utdac@lovequest.local", "utdac-dev-2026"));
  const pa = await A.newPage(); watchErrors(pa, "A");
  const pb = await B.newPage(); watchErrors(pb, "B");

  console.log("\n== 1. Onboarding & người ấy chưa vào game ==");
  await onboard(pa, "Mỡ heo", 0);
  check("A nhận 500 xu khởi đầu", await coins(A_ID) === 500);
  await go(pa, "/base/partner", "/base/partner khi người ấy chưa có nhà");
  check("Trang tấn công báo người ấy chưa dựng nhà (không sập)", await pa.getByText("chưa dựng nhà").first().isVisible());
  await go(pa, "/world"); await worldReady(pa);
  await shot(pa, "01-world-partner-chua-co-nha");
  await onboard(pb, "Út đặc", 6);
  await idle(pb);

  console.log("\n== 2. Làng 3D → lái tới Thư viện → E → học flashcard trong overlay ==");
  await go(pa, "/world?at=library"); await worldReady(pa);
  await pa.keyboard.down("ArrowUp");
  await pa.waitForFunction(() => (window as any).__world.near.current?.id === "library", null, { timeout: 90000, polling: 100 }).catch(() => undefined);
  await pa.keyboard.up("ArrowUp");
  check("Lái xe tới gần Thư viện", (await pa.evaluate(() => (window as any).__world.near.current?.id)) === "library");
  await pa.keyboard.press("KeyE");
  const ov = pa.frameLocator("iframe");
  await ov.locator("main").waitFor({ timeout: 180000 });
  check("Nhấn E → mở Thư viện dạng overlay trên nền 3D", (await pa.locator("iframe").getAttribute("src")) === "/learn");
  await ov.locator('a[href="/learn/1"]').first().click();
  await ov.getByRole("button", { name: /Đã thuộc/ }).waitFor({ timeout: 180000 });
  const c0 = await coins(A_ID);
  const nWords = ((await admin.from("words").select("id").eq("level_id", (await level(1)).id)).data ?? []).length;
  for (let i = 0; i < nWords; i++) { await ov.getByRole("button", { name: /Đã thuộc/ }).click(); await pa.waitForTimeout(150); }
  await ov.getByRole("button", { name: /Hoàn tất/ }).click();
  await pa.waitForTimeout(2500);
  check("Học hết flashcard màn 1 lần đầu → được thưởng xu", await coins(A_ID) > c0, { before: c0, after: await coins(A_ID) });
  await shot(pa, "02-overlay-flashcard");
  await pa.keyboard.press("Escape"); await pa.waitForTimeout(800);
  check("Esc đóng overlay, về làng", await pa.locator("iframe").count() === 0);

  console.log("\n== 3. Màn 1 thi đấu: A chơi trước (đúng hết) → đếm ngược 48h ==");
  const ra = await playLevel(pa, 1, "RANKED", true);
  check(`A trả lời ${ra.answered} câu qua giao diện`, ra.answered >= 10, ra);
  const l1 = await level(1);
  check("Màn 1 chuyển sang ĐẾM NGƯỢC sau khi người đầu tiên xong", l1.status === "COUNTDOWN" && !!l1.deadline_at, l1.status);
  for (const path of ["/world", "/", "/levels", "/levels/1", "/rivalry"]) await go(pa, path, `${path} khi màn đang đếm ngược`);
  await go(pa, "/world"); await worldReady(pa);
  check("Cột cờ Đấu trường hiện đồng hồ đếm ngược", await pa.getByText("⏳").first().count() > 0);
  await go(pb, "/levels/1");
  check("B chưa chơi thì không thấy điểm của A (ẩn tới khi chơi xong)", !(await pb.locator("body").innerText()).includes(String((await admin.from("level_attempts").select("score").eq("user_id", A_ID).eq("mode", "RANKED").single()).data!.score) + " điểm"));

  console.log("\n== 4. B chơi (sai hết) → đóng màn, trao thưởng 1 lần, mở màn 2 ==");
  const ca = await coins(A_ID), cb = await coins(B_ID);
  await playLevel(pb, 1, "RANKED", false);
  await wait(1500);
  const l1b = await level(1);
  check("Màn 1 ĐÓNG khi cả 2 đã chơi", l1b.status === "CLOSED", l1b.status);
  check("A thắng (winner_id)", l1b.winner_id === A_ID);
  check("Thưởng đã trao (rewarded_at)", !!l1b.rewarded_at);
  check("A nhận xu thắng, B nhận xu thua", await coins(A_ID) > ca && await coins(B_ID) > cb, { a: [ca, await coins(A_ID)], b: [cb, await coins(B_ID)] });
  check("Màn 2 được mở", (await level(2)).status === "OPEN");
  await go(pb, "/levels/1/result?attempt=x", "trang kết quả");
  await idle(pb);

  console.log("\n== 5. Luyện tập màn 2 (các dạng câu khác) ==");
  const pr = await playLevel(pa, 2, "PRACTICE", true);
  check(`Luyện tập màn 2 chạy hết, gặp các dạng: ${[...pr.types].join(", ")}`, pr.answered >= 5, pr);

  console.log("\n== 6. Căn cứ 3D: mua quân + trang trí trong 3D, kéo thả, lưu bố cục ==");
  await admin.rpc("apply_coins", { p_user: A_ID, p_amount: 2000, p_reason: "LEVEL_WIN" });
  await go(pa, "/base");
  await pa.waitForFunction(() => !!(window as any).__base, null, { timeout: 120000 });
  await pa.getByTestId("open-shop").click();
  const panel = pa.getByTestId("build-panel");
  // BASE-04: lính luyện ở nhà máy — test cho luyện nhanh (1 giây/lính), trả lại giá trị gốc ở cuối bước 7
  const swordStats = (await admin.from("shop_items").select("stats").eq("code", "sword").single()).data!.stats;
  await admin.from("shop_items").update({ stats: { ...swordStats, train_sec: 1 } }).eq("code", "sword");
  await panel.getByRole("button", { name: "🏭 Nhà máy quân" }).click();
  const cBuy = await coins(A_ID);
  await panel.locator('[data-code="fac_sword"] button').click();
  await panel.getByRole("status").waitFor({ timeout: 20000 });
  check("Xây Doanh trại trong căn cứ 3D (−300 xu)", await coins(A_ID) === cBuy - 300, { before: cBuy, after: await coins(A_ID) });
  await panel.getByRole("button", { name: "✕" }).click();
  /** chạm nhà máy trong 3D → bảng luyện → luyện n lính → chờ lính hiện cạnh nhà máy */
  const trainAt = async (p: typeof pa, n: number) => {
    await p.waitForFunction(() => (window as any).__base?.placed?.some((x: any) => x.kind === "FACTORY"), null, { timeout: 60000 });
    const f = await p.evaluate(() => (window as any).__base.placed.find((x: any) => x.kind === "FACTORY"));
    const box = (await p.getByTestId("base-scene").locator("canvas").boundingBox())!;
    const pt = await p.evaluate(([x, z]) => (window as any).__base.project(x, z, 3), [f.x, f.z]);
    await p.mouse.click(box.x + pt.x, box.y + pt.y);
    await p.getByTestId("factory-panel").waitFor({ timeout: 30000 });
    await p.getByTestId("factory-panel").locator(`[data-qty="${n}"]`).click();
    await p.waitForFunction(() => (window as any).__base?.placed?.some((x: any) => x.kind === "UNIT"), null, { timeout: 120000 });
  };
  await trainAt(pa, 1);
  check("TC-51 luyện 1 Lính kiếm ở Doanh trại → lính hiện cạnh nhà máy (−40 xu)", await coins(A_ID) === cBuy - 340, await coins(A_ID));
  await pa.getByTestId("open-shop").click();
  await panel.getByRole("button", { name: "🌸 Trang trí" }).click();
  await panel.locator('[data-code="deco_fence"] button').click();
  await pa.waitForTimeout(1500);
  check("Mua Hàng rào gỗ (−15 xu)", await coins(A_ID) === cBuy - 355);
  await panel.getByRole("button", { name: "✕" }).click();
  await pa.waitForFunction(() => (window as any).__base.placed.length >= 3, null, { timeout: 60000 });
  check("Vật mới mua tự đặt vào ô trống", true);
  await pa.waitForTimeout(4000);
  await shot(pa, "06-base-truoc-khi-sua");
  await pa.getByTestId("edit-base").click();
  await pa.waitForTimeout(800);
  const canvasBox = (await pa.locator("[data-testid=base-scene] canvas").boundingBox())!;
  const proj = (x: number, z: number, s: number) => pa.evaluate(([x, z, s]) => (window as any).__base.project(x, z, s), [x, z, s] as const);
  const sq = await pa.evaluate(() => (window as any).__base.placed.find((p: any) => p.kind === "UNIT"));
  const from = await proj(sq.x, sq.z, 2), to = await proj(13, 23, 2);
  await pa.mouse.move(canvasBox.x + from.x, canvasBox.y + from.y);
  await pa.mouse.down();
  for (let i = 1; i <= 12; i++) { await pa.mouse.move(canvasBox.x + from.x + ((to.x - from.x) * i) / 12, canvasBox.y + from.y + ((to.y - from.y) * i) / 12); await pa.waitForTimeout(60); }
  await pa.mouse.up();
  await pa.waitForTimeout(600);
  const moved = await pa.evaluate(() => (window as any).__base.placed.find((p: any) => p.kind === "UNIT"));
  check("Kéo thả đội Lính kiếm sang ô (13,23)", moved.x === 13 && moved.z === 23, moved);
  // kéo đè lên nhà → bị từ chối
  const toHouse = await proj(19, 19, 2), fromSq = await proj(13, 23, 2);
  await pa.mouse.move(canvasBox.x + fromSq.x, canvasBox.y + fromSq.y); await pa.mouse.down();
  for (let i = 1; i <= 10; i++) { await pa.mouse.move(canvasBox.x + fromSq.x + ((toHouse.x - fromSq.x) * i) / 10, canvasBox.y + fromSq.y + ((toHouse.y - fromSq.y) * i) / 10); await pa.waitForTimeout(60); }
  await pa.mouse.up(); await pa.waitForTimeout(500);
  check("Kéo đè lên nhà → báo lỗi, giữ chỗ cũ", (await pa.getByText("Không đặt đè lên nhà được").count()) > 0 && (await pa.evaluate(() => (window as any).__base.placed.find((p: any) => p.kind === "UNIT"))).x === 13);
  // cất hàng rào vào kho rồi đặt lại bằng cách chạm ô (cách dùng trên điện thoại)
  const fence = await pa.evaluate(() => (window as any).__base.placed.find((p: any) => p.kind === "DECOR"));
  const fp = await proj(fence.x, fence.z, 1);
  await pa.mouse.click(canvasBox.x + fp.x, canvasBox.y + fp.y); await pa.waitForTimeout(400);
  await pa.getByRole("button", { name: "📦 Cất vào kho" }).click();
  check("Cất hàng rào vào kho", await pa.getByTestId("tray").getByText("Hàng rào gỗ").count() > 0);
  await pa.getByTestId("tray").getByText("Hàng rào gỗ").click();
  const tgt = await proj(26, 14, 1);
  await pa.mouse.move(canvasBox.x + tgt.x, canvasBox.y + tgt.y); await pa.waitForTimeout(200);
  await pa.mouse.click(canvasBox.x + tgt.x, canvasBox.y + tgt.y); await pa.waitForTimeout(500);
  check("Chạm ô (26,14) để đặt hàng rào từ kho", (await pa.evaluate(() => (window as any).__base.placed.find((p: any) => p.kind === "DECOR")))?.x === 26);
  await pa.getByTestId("save-layout").click();
  await pa.getByText("Đã lưu bố cục căn cứ").waitFor({ timeout: 20000 });
  const lay = (await admin.from("base_layout").select("kind,ref,x,z").eq("user_id", A_ID)).data ?? [];
  check("Lưu bố cục → DB có đội quân ở (13,23) và hàng rào ở (26,14)", lay.some((l: any) => l.kind === "UNIT" && l.x === 13 && l.z === 23) && lay.some((l: any) => l.kind === "DECOR" && l.x === 26 && l.z === 14), lay);
  await pa.waitForTimeout(3000); await shot(pa, "06-base-sau-khi-sua");

  console.log("\n== 7. B xem căn cứ của A (đúng bố cục), mua quân, tấn công kiểu Clash of Clans ==");
  await go(pb, "/base/partner");
  await pb.waitForFunction(() => !!(window as any).__base, null, { timeout: 120000 });
  check("B thấy đúng bố cục A đã sắp", await pb.evaluate(() => (window as any).__base.placed.some((p: any) => p.kind === "UNIT" && p.x === 13 && p.z === 23)));
  check("B chưa có lính → nút tấn công bị khoá kèm lý do", !(await pb.getByTestId("attack-btn").isEnabled()) && (await pb.getByTestId("attack-hud").innerText()).includes("chưa có lính"));
  await go(pb, "/base");
  await pb.waitForFunction(() => !!(window as any).__base, null, { timeout: 120000 });
  await admin.rpc("apply_coins", { p_user: B_ID, p_amount: 1000, p_reason: "LEVEL_WIN" });
  await pb.reload({ waitUntil: "domcontentloaded" }); await pb.waitForFunction(() => !!(window as any).__base, null, { timeout: 120000 });
  await pb.getByTestId("open-shop").click();
  await pb.getByTestId("build-panel").locator('[data-code="fac_sword"] button').click();
  await pb.getByTestId("build-panel").getByRole("status").waitFor({ timeout: 20000 });
  await pb.getByTestId("build-panel").getByRole("button", { name: "✕" }).click();
  await trainAt(pb, 10);
  await pb.waitForFunction(() => (window as any).__base?.placed?.some((x: any) => x.kind === "UNIT"), null, { timeout: 120000 });
  await admin.from("shop_items").update({ stats: swordStats }).eq("code", "sword");
  check("B luyện 10 Lính kiếm ở Doanh trại", ((await admin.from("user_army").select("quantity").eq("user_id", B_ID).eq("unit_code", "sword").maybeSingle()).data?.quantity ?? 0) === 10);
  // A đang ở làng 3D khi bị đánh
  await go(pa, "/world"); await worldReady(pa);
  const hpA0 = (await house(A_ID))!.hp, coinA0 = await coins(A_ID), coinB0 = await coins(B_ID);
  await go(pb, "/base/partner");
  await pb.waitForFunction(() => !!(window as any).__base, null, { timeout: 120000 });
  pb.once("dialog", (d) => d.accept());
  await pb.getByTestId("attack-btn").click();
  // BTL-07: vào trận rải quân → "Tự rải hết" → tua ×2 → chờ hết trận (server chạy lại mô phỏng từ nhật ký)
  await pb.getByTestId("troop-bar").waitFor({ timeout: 120000 });
  await pb.getByTestId("auto-deploy").click();
  await pb.getByText(/▶ ×1/).click();
  await pb.waitForTimeout(6000); await shot(pb, "07-tran-danh");
  await pb.getByTestId("battle-result").waitFor({ timeout: 300000 });
  await shot(pb, "07-ket-qua");
  const atk = (await admin.from("attacks").select("*").eq("attacker_id", B_ID).order("created_at", { ascending: false }).limit(1)).data![0];
  check("Trận đánh được ghi ở server", !!atk && atk.damage > 0, atk);
  check("Màn kết quả hiện đúng sát thương server", (await pb.getByTestId("battle-damage").innerText()).includes(String(atk.damage)));
  check("Thanh HP sau hoạt cảnh = HP server", (await pb.getByTestId("house-hp").innerText()).startsWith(`${atk.defender_hp_after}/`));
  check("HP nhà A giảm đúng", (await house(A_ID))!.hp === Math.max(0, hpA0 - atk.damage) && atk.defender_hp_after === (await house(A_ID))!.hp);
  check("Chiến lợi phẩm: B được cộng, A KHÔNG bị trừ xu (sheet 2 mục G)", await coins(A_ID) === coinA0 && await coins(B_ID) === coinB0 + atk.loot, { a: [coinA0, await coins(A_ID)], b: [coinB0, await coins(B_ID)], loot: atk.loot });
  await pa.getByTestId("world-toast").waitFor({ timeout: 20000 }).catch(() => undefined);
  check("A đang ở làng 3D thấy ngay thông báo bị tấn công (realtime)", (await pa.getByTestId("world-toast").innerText().catch(() => "")).includes("tấn công"));
  await shot(pa, "07-A-bi-tan-cong-trong-lang");

  await idle(pa);
  console.log("\n== 8. Xem lại trận, nhật ký, thông báo ==");
  await go(pb, `/battle/${atk.id}`, "xem lại trận 3D");
  await pb.getByText(/▶ ×1/).click().catch(() => undefined);
  await pb.getByTestId("battle-result").waitFor({ timeout: 300000 });
  check("Xem lại trận 3D chạy tới kết quả", (await pb.getByTestId("battle-damage").innerText()).includes(String(atk.damage)));
  await go(pa, "/notifications");
  check("A có thông báo bị tấn công", (await pa.locator("main").innerText()).includes("tấn công"));
  await go(pa, "/battles");
  check("Nhật ký trận có trận vừa rồi", (await pa.locator("main").innerText()).includes(String(atk.damage)));

  await idle(pb);
  console.log("\n== 9. Sửa nhà, bật khiên → người ấy không đánh được ==");
  await go(pa, "/base");
  const repairBtn = pa.getByRole("button", { name: /🔧 Sửa/ });
  if (await repairBtn.count()) {
    await pa.getByLabel("HP cần sửa").fill("100000").catch(() => undefined);
    await repairBtn.click(); await pa.waitForTimeout(2500);
    check("Sửa nhà → HP tăng", (await house(A_ID))!.hp > atk.defender_hp_after);
  }
  await pa.getByRole("button", { name: "🛡️ Bật khiên" }).click(); await pa.waitForTimeout(2000);
  check("Bật khiên miễn phí", ((await admin.from("shields").select("id").eq("user_id", A_ID).not("activated_at", "is", null)).data ?? []).length === 1);
  await go(pb, "/base/partner");
  await pb.getByTestId("attack-hud").waitFor({ timeout: 120000 });
  check("Người ấy có khiên → nút tấn công khoá, nêu lý do", !(await pb.getByTestId("attack-btn").isEnabled()) && (await pb.getByTestId("attack-hud").innerText()).includes("khiên"));

  console.log("\n== 10. Hai người cùng ở làng: thả tim realtime ==");
  await go(pa, "/world"); await worldReady(pa);
  await go(pb, "/world"); await worldReady(pb);
  await pa.waitForTimeout(2500);
  check("A thấy xe của B trong làng", await pa.evaluate(() => !!(window as any).__world.remote.current));
  await pa.keyboard.press("KeyH");
  await pb.getByTestId("world-toast").waitFor({ timeout: 15000 }).catch(() => undefined);
  check("A nhấn H → B nhận tim", (await pb.getByTestId("world-toast").innerText().catch(() => "")).includes("thả tim"));
  await shot(pb, "10-tha-tim");

  await idle(pb);
  console.log("\n== 11. Mưa chữ: gõ nghĩa để bắn từ, nhận xu ==");
  await go(pa, "/learn/typing");
  await pa.getByRole("button", { name: "Bắt đầu" }).click();
  const all = ((await admin.from("words").select("meanings_vi,level_id").in("level_id", [(await level(1)).id, (await level(2)).id])).data ?? []).map((w: any) => w.meanings_vi[0] as string);
  const t0 = Date.now();
  while (Date.now() - t0 < 25000 && await pa.getByLabel("Nghĩa tiếng Việt").count()) {
    for (const m of all) { if (!(await pa.getByLabel("Nghĩa tiếng Việt").count())) break; await pa.getByLabel("Nghĩa tiếng Việt").fill(m); await pa.keyboard.press("Enter"); }
    await pa.waitForTimeout(300);
  }
  if (await pa.getByRole("button", { name: "Kết thúc" }).count()) await pa.getByRole("button", { name: "Kết thúc" }).click();
  await pa.waitForTimeout(3000);
  const ts = (await admin.from("typing_sessions").select("*").eq("user_id", A_ID)).data ?? [];
  check("Ván Mưa chữ được ghi, bắn trúng ≥ 1 từ", ts.length === 1 && ts[0].words_hit >= 1, ts);

  console.log("\n== 12. Các trang còn lại + admin ==");
  for (const path of ["/words", "/rivalry", "/shop?tab=decor", "/settings", "/profile/" + A_ID, "/levels/2"]) await go(pa, path);
  for (const path of ["/admin/levels", "/admin/config"]) await go(pb, path, `${path} (ADMIN)`);
  await go(pa, "/admin/levels", "/admin/levels (PLAYER bị chặn)");
  check("PLAYER không vào được trang admin", !pa.url().includes("/admin") || (await pa.locator("body").innerText()).includes("403"));

  await browser.close();
  finish();
}
main().catch((e) => { console.error(e); process.exit(1); });
