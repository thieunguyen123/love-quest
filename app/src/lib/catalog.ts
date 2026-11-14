// Danh mục "🛒 Xây thêm" trong căn cứ 3D — cùng luật khoá/lý do với trang Cửa hàng
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Base } from "@/lib/base";
import type { CatalogItem } from "@/components/base3d/build-panel";
import { fmtDur } from "@/lib/training";

export function buildCatalog(b: Base, cfg: Record<string, unknown>, closed: Set<number>): CatalogItem[] {
  const lock = (i: any) => (i.unlock_level && !closed.has(i.unlock_level) ? `🔒 Mở khi màn ${i.unlock_level} đóng` : null);
  const cap = Number(cfg.ARMY_CAP_BASE ?? 10) + Number(cfg.ARMY_CAP_PER_HOUSE_LEVEL ?? 10) * (b.house?.level ?? 0);
  const lv = b.house?.level ?? 0;
  const out: CatalogItem[] = [];
  for (const i of b.items as any[]) {
    const base = { code: i.code, name: i.name_vi, emoji: i.emoji ?? "", price: i.price, size: Number(i.stats?.size ?? 1), desc: i.stats?.desc ?? "" };
    // BASE-04: lính không mua thẳng — mua NHÀ MÁY rồi luyện (chạm nhà máy trong căn cứ)
    if (i.category === "FACTORY") {
      const u = b.byCode.get(i.stats?.unit), own = b.factories.includes(i.code);
      out.push({ ...base, category: "FACTORY", desc: `Luyện ${u?.emoji ?? ""} ${u?.name_vi ?? ""} · 🪙 ${u?.stats?.train_price}/lính · ⏱ ${fmtDur(Number(u?.stats?.train_sec ?? 0))}/lính · quân ${b.used}/${cap}`, owned: own,
        reason: own ? "✓ Đã xây — chạm nhà máy trong căn cứ để luyện" : lock(i) });
    }
    if (i.category === "WALL") {
      const max = Number(i.stats?.max_by_house?.[lv] ?? 20), have = b.defenses.filter((d: any) => d.kind === "WALL").length;
      out.push({ ...base, category: "WALL", desc: `HP ${i.stats.hp} / đoạn · đã có ${have}/${max} (xây ở 🔨 Xây dựng → 🧱)`, max: max - have, reason: have >= max ? "Đã đủ số lượng cho cấp nhà này" : null });
    }
    if (i.category === "PET") out.push({ ...base, category: "PET", desc: `${i.stats?.desc ?? ""} · ✨ tiến hoá ở cấp 3`, reason: lock(i) ?? (b.pets.some((p: any) => p.pet_code === i.code) ? "Bạn đã sở hữu" : null) });
    // BASE-05: vũ khí đã bỏ khỏi cửa hàng (không đưa vào danh mục)
    if (i.category === "DECOR") out.push({ ...base, category: "DECOR", reason: lock(i) ?? (b.decor.filter((d: any) => d.code === i.code).length >= Number(i.stats?.max ?? 20) ? "Đã đủ số lượng tối đa" : null) });
    if (i.category === "DEFENSE" || i.category === "TRAP") {
      const max = Number(i.stats?.max_by_house?.[lv] ?? 1), have = b.defenses.filter((d: any) => d.code === i.code).length;
      const need = (i.stats?.max_by_house as number[] | undefined)?.findIndex((m) => m > have) ?? -1;
      const stat = i.category === "TRAP" ? `Nổ ${i.stats.dmg} · lan ${i.stats.splash} m · ẩn với địch` : `HP ${i.stats.hp} · ${i.stats.dmg}/phát · tầm ${i.stats.range} m${i.stats.splash ? ` · nổ lan ${i.stats.splash} m` : ""}`;
      out.push({ ...base, category: "DEFENSE", desc: `${stat} · đã có ${have}/${max}`, reason: lock(i) ?? (have >= max ? (need > lv ? `Cần nhà cấp ${need} để xây thêm` : "Đã đủ số lượng cho cấp nhà này") : null) });
    }
    if (i.category === "STYLE") {
      const own = b.styles.includes(i.code), using = `style_${b.house?.style ?? "classic"}` === i.code;
      out.push({ ...base, category: "STYLE", desc: `${i.stats?.desc ?? ""} · chỉ đổi ngoại hình`, owned: own, using, reason: using ? "Đang dùng" : own ? null : lock(i) });
    }
    if (i.category === "HOUSE" && i.stats.level === lv + 1) out.push({ ...base, category: "HOUSE", name: `Cấp ${lv + 1}: ${i.name_vi}`, desc: `HP ${i.stats.max_hp} · DEF ${i.stats.def} · nền ${i.stats.size}×${i.stats.size} ô`, reason: b.house && b.house.hp < b.house.max_hp ? "Hãy sửa nhà đầy HP trước" : null });
  }
  return out;
}
