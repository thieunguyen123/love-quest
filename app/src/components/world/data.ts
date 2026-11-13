// Bố cục "Làng Tình Yêu": vị trí khu chức năng + vật cản (x, z, bán kính)
export type Zone = { id: string; name: string; emoji: string; href: string; x: number; z: number; r: number; color: string };

export const ZONES: Zone[] = [
  { id: "library", name: "Thư viện", emoji: "📚", href: "/learn", x: -28, z: -12, r: 8, color: "#60a5fa" },
  { id: "arena", name: "Đấu trường", emoji: "🏆", href: "/levels", x: 0, z: -38, r: 10, color: "#f59e0b" },
  { id: "market", name: "Chợ", emoji: "🛒", href: "/shop", x: 30, z: -12, r: 8, color: "#34d399" },
  { id: "board", name: "Bảng vàng", emoji: "⚔️", href: "/rivalry", x: 0, z: -8, r: 5, color: "#a78bfa" },
  { id: "mail", name: "Hộp thư", emoji: "📬", href: "/notifications", x: 14, z: 10, r: 4, color: "#f472b6" },
  { id: "typing", name: "Mưa chữ", emoji: "🌧️", href: "/learn/typing", x: -14, z: 10, r: 4, color: "#38bdf8" },
];
export const MY_HOUSE = { x: -32, z: 26 };
export const PARTNER_HOUSE = { x: 32, z: 26 };
export const SPAWN = { x: 0, z: 14 };

// cây ngẫu nhiên nhưng cố định (seed) để 2 máy thấy giống nhau
export function makeTrees(n = 70) {
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: { x: number; z: number; s: number }[] = [];
  while (out.length < n) {
    const x = (rnd() - 0.5) * 120, z = (rnd() - 0.5) * 120;
    const near = [...ZONES, { ...MY_HOUSE, r: 12 }, { ...PARTNER_HOUSE, r: 12 }, { x: SPAWN.x, z: SPAWN.z, r: 10 }].some((o) => Math.hypot(o.x - x, o.z - z) < ("r" in o ? o.r : 8) + 6);
    if (!near && Math.hypot(x, z) > 6) out.push({ x, z, s: 0.8 + rnd() * 0.9 });
  }
  return out;
}
export const TREES = makeTrees();
export const OBSTACLES: { x: number; z: number; r: number }[] = [
  ...ZONES.filter((z) => z.id !== "board" && z.id !== "mail" && z.id !== "typing").map((z) => ({ x: z.x, z: z.z, r: z.r * 0.55 })),
  { x: MY_HOUSE.x, z: MY_HOUSE.z, r: 4.5 }, { x: PARTNER_HOUSE.x, z: PARTNER_HOUSE.z, r: 4.5 },
  ...TREES.map((t) => ({ x: t.x, z: t.z, r: 0.7 * t.s })),
];
export const WORLD_HALF = 58;
