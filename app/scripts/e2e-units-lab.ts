/* eslint-disable @typescript-eslint/no-explicit-any */
// Chụp trang /dev/units (xem thử mô hình lính) ở các hoạt ảnh. Chạy: server test :3101 rồi IT_ENV=.env.test npx tsx scripts/e2e-units-lab.ts
import path from "node:path";
import { BASE, SHOTS, context, launch, sessionCookies, watchErrors } from "./e2e-lib";
(async () => {
  const b = await launch(); const c = await context(b, await sessionCookies("moheo@lovequest.local", "moheo-dev-2026")); const p = await c.newPage();
  watchErrors(p, "lab");
  await p.goto(`${BASE}/dev/units?gfx=high`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await p.waitForFunction(() => (window as any).__perf?.calls > 20, null, { timeout: 180000 });
  for (const a of (process.argv[2] ?? "idle,attack,run").split(",")) {
    await p.click(`[data-anim="${a}"]`); await p.waitForTimeout(a === "attack" ? 1800 : 1500);
    await p.screenshot({ path: path.join(SHOTS, `lab-${a}.png`) });
  }
  await b.close();
})();
