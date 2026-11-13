// Danh mục "🛒 Xây thêm" trong căn cứ 3D — cùng luật khoá/lý do với trang Cửa hàng
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Base } from "@/lib/base";
import { tokenCount } from "@/lib/base";
import type { CatalogItem } from "@/components/base3d/build-panel";

export function buildCatalog(b: Base, cfg: Record<string, unknown>, closed: Set<number>): CatalogItem[] {
  const lock = (i: any) => (i.unlock_level && !closed.has(i.unlock_level) ? `🔒 Mở khi màn ${i.unlock_level} đóng` : null);
  const cap = Number(cfg.ARMY_CAP_BASE ?? 10) + Number(cfg.ARMY_CAP_PER_HOUSE_LEVEL ?? 10) * (b.house?.level ?? 0);
  const lv = b.house?.level ?? 0;
  const out: CatalogItem[] = [];
  for (const i of b.items as any[]) {
    const base = { code: i.code, name: i.name_vi, emoji: i.emoji ?? "", price: i.price, size: Number(i.stats?.size ?? 1), desc: i.stats?.desc ?? "" };
    if (i.category === "UNIT") out.push({ ...base, category: "UNIT", desc: `ATK ${i.stats.atk} · chiếm ${i.slots} chỗ · quân ${b.used}/${cap}`, reason: lock(i) ?? (b.used + i.slots > cap ? "Hết chỗ chứa quân — nâng cấp nhà" : null) });
    if (i.category === "PET") out.push({ ...base, category: "PET", reason: lock(i) ?? (b.pets.some((p: any) => p.pet_code === i.code) ? "Bạn đã sở hữu" : null) });
    if (i.category === "WEAPON") out.push({ ...base, category: "WEAPON", desc: `+${Math.round(i.stats.atk_pct * 100)}% ATK · cần 1 ⚔️ quyền mua`, reason: lock(i) ?? (b.weapons.some((w: any) => w.weapon_code === i.code) ? "Bạn đã sở hữu" : tokenCount(b.inv, "WEAPON_LICENSE") < 1 ? "Cần 1 Quyền mua vũ khí" : null) });
    if (i.category === "DECOR") out.push({ ...base, category: "DECOR", reason: lock(i) ?? (b.decor.filter((d: any) => d.code === i.code).length >= Number(i.stats?.max ?? 20) ? "Đã đủ số lượng tối đa" : null) });
    if (i.category === "HOUSE" && i.stats.level === lv + 1) out.push({ ...base, category: "HOUSE", name: `Cấp ${lv + 1}: ${i.name_vi}`, desc: `HP ${i.stats.max_hp} · DEF ${i.stats.def} · nền ${i.stats.size}×${i.stats.size} ô`, reason: b.house && b.house.hp < b.house.max_hp ? "Hãy sửa nhà đầy HP trước" : null });
  }
  return out;
}
