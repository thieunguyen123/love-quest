// Dựng mô hình 3D cho game từ các bộ asset CC0 của KayKit (Kay Lousberg, www.kaylousberg.com) trên GitHub.
// Tải theo commit cố định → gộp thành .glb, bỏ hoạt ảnh không dùng, nén meshopt → public/models/*.glb
// Chạy: npx tsx scripts/build-models.mts   (cache tải về ở .model-cache/, không commit)
import { NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, meshopt, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, ".model-cache");
const OUT = path.join(ROOT, "public", "models");
const REPOS = {
  med: ["KayKit-Medieval-Hexagon-Pack-1.0", "84fa4e91af6a88989be7c99e0891cede11f2ca38", "addons/kaykit_medieval_hexagon_pack/Assets/gltf"],
  city: ["KayKit-City-Builder-Bits-1.0", "63976910ca04d16f0fc531b9c614244be8128713", "addons/kaykit_city_builder_bits/Assets/gltf"],
  adv: ["KayKit-Character-Pack-Adventures-1.0", "672074b73ba276876a19e8816ecdc5241817ab47", "addons/kaykit_character_pack_adventures"],
} as const;
type Repo = keyof typeof REPOS;

const COLORS = ["blue", "red", "green", "yellow"];
// [repo, đường dẫn gltf/glb trong repo, tên xuất, (tuỳ chọn) các file phụ cần tải kèm]
const LIST: [Repo, string, string][] = [];
for (const c of COLORS) for (const b of ["home_A", "home_B", "tavern", "castle", "tower_A"]) LIST.push(["med", `buildings/${c}/building_${b}_${c}.gltf`, `${b}_${c}`]);
for (const [b, c] of [["church", "blue"], ["barracks", "yellow"], ["archeryrange", "yellow"], ["market", "green"], ["watermill", "blue"], ["well", "red"], ["tower_B", "red"], ["lumbermill", "green"], ["tower_catapult", "red"], ["windmill", "yellow"]] as const)
  LIST.push(["med", `buildings/${c}/building_${b}_${c}.gltf`, `${b}_${c}`]);
for (const n of ["building_destroyed", "building_scaffolding", "projectile_catapult", "fence_wood_straight", "building_stage_A"]) LIST.push(["med", `buildings/neutral/${n}.gltf`, n.replace("building_", "")]);
for (const n of ["trees_A_large", "trees_A_medium", "trees_B_large", "trees_B_medium", "tree_single_A", "tree_single_B", "rock_single_A", "rock_single_B", "rock_single_C", "mountain_A_grass_trees", "mountain_B_grass_trees", "hills_A_trees", "hills_B_trees", "cloud_big", "cloud_small"]) LIST.push(["med", `decoration/nature/${n}.gltf`, n]);
for (const n of ["barrel", "crate_A_big", "crate_B_big", "flag_red", "flag_blue", "flag_yellow", "flag_green", "tent", "target", "weaponrack", "sack", "wheelbarrow", "bucket_arrows", "resource_lumber"]) LIST.push(["med", `decoration/props/${n}.gltf`, n]);
for (const n of ["car_sedan", "car_hatchback", "car_taxi", "car_stationwagon", "car_police", "streetlight", "bench", "bush", "firehydrant"]) LIST.push(["city", `${n}.gltf`, n]);
for (const n of ["sword_2handed", "crossbow_2handed", "axe_2handed", "staff", "shield_round_color", "arrow"]) LIST.push(["adv", `Assets/gltf/${n}.gltf`, n]);
for (const n of ["Knight", "Barbarian", "Rogue", "Mage"]) LIST.push(["adv", `Characters/gltf/${n}.glb`, n.toLowerCase()]);

// Hoạt ảnh nhân vật được giữ lại (còn lại bỏ để file nhẹ)
const KEEP_ANIMS = new Set(["Idle", "Walking_A", "Running_A", "Cheer", "Hit_A", "Death_A", "Death_A_Pose", "1H_Melee_Attack_Chop", "2H_Melee_Attack_Chop", "1H_Ranged_Shoot", "2H_Ranged_Shoot", "Spellcast_Shoot", "2H_Melee_Idle"]);

// Bỏ kênh hoạt ảnh không đổi theo thời gian và trùng tư thế nghỉ của xương (phần lớn kênh scale/translation)
function dropStaticChannels(doc: Document) {
  let n = 0;
  for (const a of doc.getRoot().listAnimations()) for (const ch of a.listChannels()) {
    const node = ch.getTargetNode(), out = ch.getSampler()?.getOutput(); if (!node || !out) continue;
    const path = ch.getTargetPath();
    const rest = path === "rotation" ? node.getRotation() : path === "scale" ? node.getScale() : path === "translation" ? node.getTranslation() : null;
    if (!rest) continue;
    const k = rest.length, arr = out.getArray()!, el = [] as number[];
    let constant = true;
    for (let i = 0; i < out.getCount() && constant; i++) { out.getElement(i, el); for (let j = 0; j < k; j++) if (Math.abs(el[j] - rest[j]) > 1e-3) { constant = false; break; } }
    void arr;
    if (constant) { ch.getSampler()?.dispose(); ch.dispose(); n++; }
  }
  return n;
}

const raw = (r: Repo, p: string) => `https://raw.githubusercontent.com/KayKit-Game-Assets/${REPOS[r][0]}/${REPOS[r][1]}/${REPOS[r][2]}/${p}`;
async function fetchTo(url: string, dst: string) {
  try { await fs.access(dst); return; } catch { /* chưa có */ }
  const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.writeFile(dst, Buffer.from(await res.arrayBuffer()));
}
// tải file gltf + mọi buffer/texture nó tham chiếu
async function download(r: Repo, p: string): Promise<string> {
  const dst = path.join(CACHE, r, p);
  await fetchTo(raw(r, p), dst);
  if (p.endsWith(".gltf")) {
    const j = JSON.parse(await fs.readFile(dst, "utf8"));
    const uris = [...(j.buffers ?? []), ...(j.images ?? [])].map((x: { uri?: string }) => x.uri).filter((u): u is string => !!u && !u.startsWith("data:"));
    for (const u of uris) {
      const rel = path.posix.join(path.posix.dirname(p), decodeURIComponent(u));
      // texture của vũ khí nằm ở thư mục nhân vật
      await fetchTo(raw(r, rel), path.join(CACHE, r, rel)).catch(async () => fetchTo(raw(r, `Characters/gltf/${path.basename(u)}`), path.join(CACHE, r, rel)));
    }
  }
  return dst;
}

async function main() {
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  await fs.mkdir(OUT, { recursive: true });
  let total = 0;
  for (const [r, p, name] of LIST) {
    const src = await download(r, p);
    const doc: Document = await io.read(src);
    const root = doc.getRoot();
    const isChar = p.startsWith("Characters/");
    if (isChar) {
      // xoá cả sampler/channel con, nếu không chúng vẫn giữ accessor và file không nhẹ đi
      for (const a of root.listAnimations()) if (!KEEP_ANIMS.has(a.getName())) { a.listChannels().forEach((c) => c.dispose()); a.listSamplers().forEach((sm) => sm.dispose()); a.dispose(); }
      await doc.transform(resample({ tolerance: 1e-3 }));
      dropStaticChannels(doc);
    }
    // nhân vật: meshopt làm phình kênh hoạt ảnh nên chỉ nén mô hình tĩnh
    await doc.transform(weld(), dedup(), prune({ keepLeaves: true }), ...(isChar ? [] : [meshopt({ encoder: MeshoptEncoder, level: "medium" })]));
    // accessor mồ côi (chỉ còn Root làm cha) sau khi bỏ hoạt ảnh — prune không dọn hết
    for (const acc of root.listAccessors()) if (acc.listParents().every((x) => x === root)) acc.dispose();
    const bytes = await io.writeBinary(doc);
    await fs.writeFile(path.join(OUT, `${name}.glb`), bytes);
    total += bytes.byteLength;
    if (isChar) console.log(`${name}.glb ${(bytes.byteLength / 1024).toFixed(0)}KB anims: ${root.listAnimations().map((a) => a.getName()).join(", ")}`);
  }
  await fs.writeFile(path.join(OUT, "CREDITS.txt"), "3D models: KayKit by Kay Lousberg (www.kaylousberg.com), CC0 1.0.\nMedieval Hexagon Pack, City Builder Bits, Adventurers Character Pack.\n");
  console.log(`${LIST.length} mô hình, tổng ${(total / 1e6).toFixed(2)} MB → public/models/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
