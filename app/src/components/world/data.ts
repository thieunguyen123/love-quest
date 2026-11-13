// Bố cục "Làng Tình Yêu": vị trí khu chức năng, nhà, đồ chơi vật lý, cây (x, z, bán kính)
export type Zone = { id: string; name: string; emoji: string; href: string; x: number; z: number; r: number; color: string };

export const ZONES: Zone[] = [
  { id: "library", name: "Thư viện", emoji: "📚", href: "/learn", x: -28, z: -12, r: 8, color: "#60a5fa" },
  { id: "arena", name: "Đấu trường", emoji: "🏆", href: "/levels", x: 0, z: -38, r: 10, color: "#f59e0b" },
  { id: "market", name: "Chợ", emoji: "🛒", href: "/shop", x: 30, z: -12, r: 8, color: "#34d399" },
  { id: "board", name: "Bảng vàng", emoji: "⚔️", href: "/rivalry", x: 0, z: -8, r: 5, color: "#a78bfa" },
  { id: "mail", name: "Hộp thư", emoji: "📬", href: "/notifications", x: 14, z: 10, r: 4, color: "#f472b6" },
  { id: "typing", name: "Mưa chữ", emoji: "🌧️", href: "/learn/typing", x: -14, z: 10, r: 4, color: "#38bdf8" },
  { id: "words", name: "Sổ từ", emoji: "📒", href: "/words", x: -44, z: -36, r: 4, color: "#fb923c" },
  { id: "battles", name: "Nhật ký trận", emoji: "📜", href: "/battles", x: 44, z: -36, r: 4, color: "#f87171" },
];
// Các khu "to" có nhà khối + mái (va chạm được); còn lại là biển báo
export const BIG_ZONES = new Set(["library", "arena", "market"]);
export const MY_HOUSE = { x: -32, z: 26 };
export const PARTNER_HOUSE = { x: 32, z: 26 };
export const SPAWN = { x: 0, z: 14 };
export const WORLD_HALF = 58;

// Đồ chơi vật lý kiểu bruno-simon: dốc nhảy, ky bowling, chồng thùng, cọc giao thông
export const RAMP = { x: 0, z: 40, w: 6, len: 9, height: 2.2 };          // lên dốc theo hướng +z
export const BOWLING = { x: 20, z: 44 };                                    // tam giác 10 ky, mở về phía -z
export const CRATES = { x: -20, z: 44 };
export const CONES: { x: number; z: number }[] = [
  ...[-30, -22, -14].map((x) => ({ x, z: 5 })), ...[14, 22, 30].map((x) => ({ x, z: 11 })),
  ...[-20, -26, -32].map((z) => ({ x: 3.5, z })),
];

export function bowlingPins() {
  const out: { x: number; z: number }[] = [];
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) out.push({ x: BOWLING.x + (i - row / 2) * 1.1, z: BOWLING.z + row * 1.0 });
  return out;
}
export function crateStack() {
  const out: { x: number; y: number; z: number }[] = [];
  for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 3 - layer; i++) out.push({ x: CRATES.x + (i - (2 - layer) / 2) * 1.25, y: 0.6 + layer * 1.2, z: CRATES.z });
  return out;
}

// Vùng cấm trồng cây (để cây không mọc đè lên khu, nhà, đường, đồ chơi)
const KEEP_CLEAR: { x: number; z: number; r: number }[] = [
  ...ZONES, { ...MY_HOUSE, r: 12 }, { ...PARTNER_HOUSE, r: 12 }, { ...SPAWN, r: 10 },
  // điểm xuất hiện khi vào /world?at=<khu> (xem spawnAt)
  ...[...ZONES, MY_HOUSE, PARTNER_HOUSE].map((t) => ({ x: t.x + (t.x < 0 ? 12 : -12), z: t.z + 10, r: 1 })),
  { x: RAMP.x, z: RAMP.z, r: 9 }, { x: BOWLING.x, z: BOWLING.z + 1, r: 7 }, { x: CRATES.x, z: CRATES.z, r: 6 },
];

// cây ngẫu nhiên nhưng cố định (seed) để 2 máy thấy giống nhau
export function makeTrees(n = 70) {
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: { x: number; z: number; s: number }[] = [];
  while (out.length < n) {
    const x = (rnd() - 0.5) * 110, z = (rnd() - 0.5) * 110;
    const blocked = KEEP_CLEAR.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 6);
    const onRoad = Math.abs(x) < 6 || Math.abs(z - 8) < 6;
    if (!blocked && !onRoad) out.push({ x, z, s: 0.8 + rnd() * 0.9 });
  }
  return out;
}
export const TREES = makeTrees();

// Vật cản cố định (dùng cho test & kiểm tra điểm xuất phát)
export const OBSTACLES: { x: number; z: number; r: number }[] = [
  ...ZONES.filter((z) => BIG_ZONES.has(z.id)).map((z) => ({ x: z.x, z: z.z, r: z.r * 0.55 })),
  { x: MY_HOUSE.x, z: MY_HOUSE.z, r: 4.5 }, { x: PARTNER_HOUSE.x, z: PARTNER_HOUSE.z, r: 4.5 },
  ...TREES.map((t) => ({ x: t.x, z: t.z, r: 0.35 * t.s })),
];
