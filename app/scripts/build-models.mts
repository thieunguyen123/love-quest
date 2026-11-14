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

// Bộ CC0 của Quaternius (quaternius.com) và Kenney (kenney.nl), lấy từ kho tài nguyên công khai của GDevelop.
// id = mã băm nội dung của asset (cố định) → assets/<id>.json chứa đường dẫn .glb, tác giả, giấy phép (đều CC0).
const GD: [string, string][] = [
  ["381108dda950be19b61c2225373afa7ced691f2395e24984a07d6420d24a41d5", "house_l0"],   // 3d fantasy rts · Houses First Age 1 Level 1
  ["6d50ac98da5ae6a5db6e37b74c3ece5ea82c606e91924a82218ecf397f3636bf", "house_l1"],   // 3d fantasy rts · Houses Second Age 1 Level 2
  ["d96048e3d410b265e0285d578a937dafae3d0f3d158a17bd394027e61a7f93ed", "house_l2"],   // 3d fantasy rts · Storage Second Age Level 3
  ["f78636d4909f934b6da2cb7a470d072b2b44b473e84a7d28a7260f42e82684e5", "house_l3"],   // 3d fantasy rts · Tower House Second Age
  ["f5f89567ae711097f658124a754fba2fea0bac1817bffcc8acccf3d4f3c21d32", "house_l4"],   // 3d fantasy rts · Barracks Second Age Level 3
  ["82288caa2f93e57f0371ee7778d8bd4216ff596da0a26296fcb373e58da8edfe", "house_l5"],   // 3d fantasy rts · Wonder Second Age Level 3
  ["00f8f1c32c9238732b5fee7565543be0e18c10f2b518b02d78cbebd7737ef395", "def_tower"],   // 3d fantasy rts · Watch Tower Second Age Level 3
  ["7d6634950a83f55cd5bab22b6297bbc1e6ebb4ce11ade1a2f393b8e6820c5cc2", "def_tower_wood"],   // 3d fantasy rts · Watch Tower First Age Level 3
  ["becba1fd4a2ff961090f932a66450a4ef96d67feb526118c9d6d7475ecf43a88", "def_cannon"],   // 3d pirate kit · Cannon
  ["f7bf90a5f89a185abb29cdaa4068dcbcdca4fb6cda776d3866cbf1217b7e4e82", "trap_spike"],   // 3d platformer kit · Trap Spikes
  ["415cad5ee4d7177900c0c44d749fdbe8a4ec629b77e1e7bdfe7399cdbc558dbd", "trap_bomb"],   // 3d pirate kit · Bomb
  ["a0b13e43fc8411ef97829d41af3a9480348f9e60a490f62a2f6fd6ddd8fd7460", "unit_catapult"],   // 3d castle kit · Siege Catapult
  ["595ad91855b17f75ff78bc52a044a125d46ef868a77dc2a5f3bf1b7a65a1ae56", "pet_cat"],   // 3d colorful monsters · Cat
  ["127a25bef7c32c947058fde5bd5a5c25e55ff8aae2dd3e1d06082e9c60007b66", "pet_corgi"],   // 3d colorful monsters · Dog
  ["ffdb18544758eed9976ab0918f10973766e407f2e6d96e675eec671f6c7a7108", "pet_owl"],   // 3d colorful monsters · Pigeon (tô màu cú)
  ["bae3b229fe58cfb50338a2427c71bd034f82e4de3439442989ea22ec2ba9dea9", "pet_dragon"],   // 3d colorful monsters · Dragon (tô hồng)
  ["931dff164f7a386bbc6e0414e70c86111008296f2ae7f01d2e289d812a1bac11", "rts_pines"],   // 3d fantasy rts · Resource Pine Tree Group
  ["269005e01ce3e16c3e695f797677e19c575d56d0a67a09f8c03140d377eb9e17", "rts_trees"],   // 3d fantasy rts · Resource Tree Group
  ["0a705f6a3806e298d1c7740448b141cb20a74c28dcb0c230080918e32a141d4d", "rts_mountain"],   // 3d fantasy rts · Mountain Large Single
  ["806c9bbea9de9a81b00e8926ba5a5164fec795cd1b82d135c431ba1933142e30", "rts_mountains"],   // 3d fantasy rts · Mountain Group 1
  ["fd358a1e4e79e3ebe01985b46f59732e128eb0497f0670d1aa47873df44c1094", "bush_flowers"],   // 3d stylized nature megakit · Bush Common Flowers
  ["f8523d7e74ae158229f8de1b815ebbb4ce3c94eb79ec3aba06a36003d8a833d7", "rts_rocks"],   // 3d fantasy rts · Rock Group
  ["36931cace67b4067e4a9f9c34e65361001e44bdd07088551a916bfcc6ed36ac2", "flag_wide"],   // 3d castle kit · Flag Wide
  ["90fe0ab4f4635a4aef9f2193a7dbb0fea9445048e23e6af59ece75edea718fbb", "pet_mushnub"],   // 3d colorful monsters · Mushnub
  ["728c926328ad6a56606607ac921f0e29d65dd0ec326e7805a88797e147d99d87", "pet_mushnub_evo"],   // 3d colorful monsters · Mushnub Evolved
  ["10eded1045bbe3e4f0b3f5d1a6664cab19ff965afe0c0ddcc66604f48bb4669c", "pet_armabee"],   // 3d colorful monsters · Armabee
  ["5378d5811a1fe958e206a6d58a5ff274dc29eca284c1c878cb93dcea10cb1f57", "pet_armabee_evo"],   // 3d colorful monsters · Armabee Evolved
  ["9738751b11ec54411cb3d53259f9544a8827da70edd3b111f1a95bd76b31f64a", "pet_glub"],   // 3d colorful monsters · Glub
  ["61102956e79b537b6cca9c8c669fca783bb7b2d6a5bd4bc6cf0dd34f984e24d5", "pet_glub_evo"],   // 3d colorful monsters · Glub Evolved
  ["85b283e7c414ed7c0fbc05ddb0edf88da58bdafef19ec2468433dca6882004c9", "pet_alpaking"],   // 3d colorful monsters · Alpaking
  ["f3b776be39542cd422e7fdc5c5584d455fd5046d833d2bb8899c067442e886ca", "pet_alpaking_evo"],   // 3d colorful monsters · Alpaking Evolved
  ["5a56edad602ddd7f3e87d7dd1d08c69d216c86952b1e727b82ec19357ff69f98", "pet_goleling"],   // 3d colorful monsters · Goleling
  ["889929604af95bc0bb6e4b4be86befdb6ce83026fb3bc7a0d6637c6110b4a6ea", "pet_goleling_evo"],   // 3d colorful monsters · Goleling Evolved
  ["b2f68a85a7dfcb6c4487dd1c74f87ef59b47a17986a489367de74dfd5e57b278", "pet_dragon_evo"],   // 3d colorful monsters · Dragon Evolved
  ["022e67caa4770c7e7ceac5f9c88583ad06e91ac69f926824ab12e310d7398942", "unit_ninja"],   // 3d colorful monsters · Ninja
  ["a3db39a416f9e0ced6b42621fa546f071327e3a775eb94dd2afb1b4dd81a94df", "unit_yeti"],   // 3d colorful monsters · Yeti
  ["4e7edd3216e745d67da26c232d25897d6139a7996410741cdf25d6a0e69a2480", "house_town_l0"],   // 3d fantasy rts · Houses First Age 2 Level 1
  ["4cde1a48c22520fc65fdbf4e894d093860d202094a76e07006b09d16872026a9", "house_temple_l0"],   // 3d fantasy rts · Temple First Age Level 1
  ["68538e55a77730a581d4835ed9890e31608f05aa558a626d551bdf0ceb1c38b5", "house_fortress_l0"],   // 3d fantasy rts · Barracks First Age Level 1
  ["e6ec77657e6d39d6c447eecdbcc3241f35ccbc45a2f7cf061e68e8821e861b13", "house_town_l1"],   // 3d fantasy rts · Houses First Age 2 Level 2
  ["e1cd1adc17c46354ee7e9ca30818e984c0b04eb41bec699c45126925fd97f8bc", "house_temple_l1"],   // 3d fantasy rts · Temple First Age Level 2
  ["db69421e1c72478a47d299f49ad85dfda741d043589bf4f1999194eb0407d376", "house_fortress_l1"],   // 3d fantasy rts · Barracks First Age Level 2
  ["fbefddef9b795611641ed08d130815975d068a5117f52aa9226d1ca3aa88dd6d", "house_town_l2"],   // 3d fantasy rts · Houses First Age 2 Level 3
  ["980536ec8acf59b8f2c6dc833c530d9d8f0070cfe892211bbba6d2307c97fec8", "house_temple_l2"],   // 3d fantasy rts · Temple First Age Level 3
  ["a207c21d968354d2a1b887428adc9cc6d381dde0e9d1ea69db38263c16661f5a", "house_fortress_l2"],   // 3d fantasy rts · Barracks First Age Level 3
  ["afc51b1b7115942c78fe0b12ff810b8e4081abd7833c81196e4e7adf85a4f42a", "house_town_l3"],   // 3d fantasy rts · Houses Second Age 2 Level 1
  ["680d58f31d2799af8ae5c0f45631da6ae7e412578789790f0ba22a957533882a", "house_temple_l3"],   // 3d fantasy rts · Temple Second Age Level 1
  ["e25513e80f5726f4c386479071528230fcbe19ec85eace1b427d35bfd19a5d18", "house_fortress_l3"],   // 3d fantasy rts · Barracks Second Age Level 1
  ["eb767d6365dc665e17a12618a46cd9f175eb9299d3fd73733a46c85d5758ef1e", "house_town_l4"],   // 3d fantasy rts · Houses Second Age 2 Level 2
  ["9af22652d29bb8765929ba44b071e6dd7b446c3443c546bf1c58a02b016f5376", "house_temple_l4"],   // 3d fantasy rts · Temple Second Age Level 2
  ["08b138de8be5501868889a6a26238600056eab58c61b00da750311d9f9e8fd19", "house_fortress_l4"],   // 3d fantasy rts · Barracks Second Age Level 2
  ["d6a2d9c5e4a244d1eb36d4b5f6f47f4bff6f99e7611cb54f12f7cff4a7b04fb5", "house_town_l5"],   // 3d fantasy rts · Houses Second Age 2 Level 3
  ["9b1fb00444a69b0233f7a1e1c2f704aed8845e0f23cf04bddc22a1e85708df3b", "house_temple_l5"],   // 3d fantasy rts · Temple Second Age Level 3
  ["f5f89567ae711097f658124a754fba2fea0bac1817bffcc8acccf3d4f3c21d32", "house_fortress_l5"],   // 3d fantasy rts · Barracks Second Age Level 3
  ["f5881dfbee73bbf53cf1e70fb72a19e6531d7171741cc8d6b23fad38b9c4eb76", "unit_horse"],   // 3d animated animals · Horse (Quaternius) — ngựa cho Kỵ binh
  ["7c207e2974dbd33eece880ced157a74cf502d1fb173be564cbdc603a3891b63c", "weapon_bow"],   // 3d mini forest · Weapon Bow (Kenney) — cung cho Cung thủ
  ["d329912219d7b5bd75bfb0432f8854af27e80d5605a42f79bde6ed49e19b4bab", "fac_archery"],   // 3d fantasy rts · Archery First Age Level 2 — trường bắn
  ["b8f9063ec834c8a9fac0fbc0242891f192e46f82674bc93eeccaae1dc0cc7280", "fac_ninja"],   // 3d fantasy rts · Tower House First Age — tháp ninja
  ["1177b7d18c052fce2ca48f72a08e481c9643fe7d91db2c6aa2c4f6035fed98dd", "fac_mine"],   // 3d fantasy rts · Mine — hang Yeti
  ["9777d00b865eabe0afc83f0e763c65b1e6c41d1059d2a2ffc59966fae1259001", "fac_workshop"],   // 3d fantasy rts · Storage First Age Level 2 — xưởng máy bắn đá
];
// hoạt ảnh giữ lại cho mô hình GDevelop có hoạt ảnh (còn lại bỏ)
const GD_KEEP = new Set(["Idle", "Walk", "Run", "Punch", "Weapon", "Death", "Wave", "Dance", "Jump", "Yes", "HitRecieve", "Flying_Idle", "Fast_Flying", "HitReact", "Gallop", "Attack_Kick", "show", "hide", "show-hide"]);

// Hoạt ảnh nhân vật được giữ lại (còn lại bỏ để file nhẹ)
const KEEP_ANIMS = new Set(["Sit_Chair_Pose", "Idle", "Walking_A", "Running_A", "Cheer", "Hit_A", "Death_A", "Death_A_Pose", "1H_Melee_Attack_Chop", "2H_Melee_Attack_Chop", "1H_Ranged_Shoot", "2H_Ranged_Shoot", "Spellcast_Shoot", "2H_Melee_Idle"]);

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
  const credits = new Set<string>();
  for (const [id, name] of GD) {
    const metaPath = path.join(CACHE, "gd", `${id}.json`);
    await fetchTo(`https://resources.gdevelop-app.com/assets-database/assets/${id}.json`, metaPath);
    const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    if (!/CC0/.test(meta.license)) throw new Error(`${name}: giấy phép ${meta.license}`);
    credits.add(`${meta.authors.join(", ")} — ${meta.tags[0]}`);
    const src = path.join(CACHE, "gd", `${id}.glb`);
    await fetchTo(encodeURI(meta.objectAssets[0].resources[0].file), src);
    const doc: Document = await io.read(src);
    const root = doc.getRoot();
    for (const a of root.listAnimations()) if (!GD_KEEP.has(a.getName())) { a.listChannels().forEach((c) => c.dispose()); a.listSamplers().forEach((sm) => sm.dispose()); a.dispose(); }
    const animated = root.listAnimations().length > 0;
    if (animated) { await doc.transform(resample({ tolerance: 1e-3 })); dropStaticChannels(doc); }
    await doc.transform(weld(), dedup(), prune({ keepLeaves: true }), ...(animated ? [] : [meshopt({ encoder: MeshoptEncoder, level: "medium" })]));
    for (const acc of root.listAccessors()) if (acc.listParents().every((x) => x === root)) acc.dispose();
    const bytes = await io.writeBinary(doc);
    await fs.writeFile(path.join(OUT, `${name}.glb`), bytes);
    total += bytes.byteLength;
    console.log(`${name}.glb ${(bytes.byteLength / 1024).toFixed(0)}KB${animated ? " anims: " + root.listAnimations().map((a) => a.getName()).join(", ") : ""}`);
  }
  await fs.writeFile(path.join(OUT, "CREDITS.txt"), "3D models (all CC0 1.0 / public domain):\n- KayKit by Kay Lousberg (www.kaylousberg.com): Medieval Hexagon Pack, City Builder Bits, Adventurers Character Pack.\n" + [...credits].sort().map((c) => `- ${c}`).join("\n") + "\n  (Quaternius: quaternius.com · Kenney: kenney.nl — tải qua kho tài nguyên công khai của GDevelop)\n");
  console.log(`${LIST.length + GD.length} mô hình, tổng ${(total / 1e6).toFixed(2)} MB → public/models/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
