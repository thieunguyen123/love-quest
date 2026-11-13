/* eslint-disable @typescript-eslint/no-explicit-any */
// Đọc docs/spec.xlsx -> supabase/seed/*.json. Chạy: npm run seed:export
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const wb = XLSX.readFile(path.join(root, "docs/spec.xlsx"));
const out = path.resolve(__dirname, "../supabase/seed");
fs.mkdirSync(out, { recursive: true });

const rows = (name: string): unknown[][] =>
  XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, blankrows: false });
const write = (f: string, d: unknown) => fs.writeFileSync(path.join(out, f), JSON.stringify(d, null, 2));

// 3. CẤU HÌNH: Nhóm | Key | Giá trị | Đơn vị | Ý nghĩa
const config = rows("3. CẤU HÌNH").slice(3).filter((r: any) => r[1] && r[2] !== null)
  .map((r) => ({ key: r[1], value: r[2] === "TRUE" ? true : r[2], unit: r[3], description: r[4] }));
write("game_config.json", config);

// 4. MÀN CHƠI
const levels = rows("4. MÀN CHƠI").slice(3).filter((r: any) => typeof r[0] === "number")
  .map((r) => ({
    order_no: r[0], topic_en: r[1], topic_vi: r[2], cefr: r[3], word_count: r[4], question_count: r[5],
    seconds_per_question: r[6], question_types: String(r[7]).split(",").map((s) => s.trim()),
    reward_multiplier: r[8], win_coins: r[9], lose_coins: r[10], draw_coins: r[11], unlock_note: r[13],
  }));
write("levels.json", levels);

// 8. TỪ VỰNG MẪU
const words = rows("8. TỪ VỰNG MẪU").slice(3).filter((r: any) => typeof r[0] === "number")
  .map((r) => ({
    level: r[0], word: r[1], ipa: r[2], part_of_speech: r[3],
    meanings_vi: String(r[4]).split("|").map((s) => s.trim()), example_en: r[5], example_vi: r[6],
  }));
write("words.json", words);

console.log({ config: config.length, levels: levels.length, words: words.length });
