// Parser CSV nhỏ (hỗ trợ dấu ngoặc kép, dấu phẩy trong ô, "" thoát dấu nháy) + validate từ vựng (ADM-02)
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export const WORD_HEADER = ["level", "word", "ipa", "part_of_speech", "meanings_vi", "example_en", "example_vi"];

export type ParsedWord = { word: string; ipa: string | null; part_of_speech: string | null; meanings_vi: string[]; example_en: string | null; example_vi: string | null };

export function parseWordsCsv(text: string, levelNo: number): { words: ParsedWord[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (!rows.length) return { words: [], errors: ["File rỗng"] };
  const head = rows[0].map((h) => h.trim());
  if (WORD_HEADER.some((h, i) => head[i] !== h)) return { words: [], errors: [`Header phải là: ${WORD_HEADER.join(",")}`] };
  const seen = new Set<string>();
  const words: ParsedWord[] = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const [lv, word, ipa, pos, meanings, ex, exVi] = r.map((x) => (x ?? "").trim());
    if (Number(lv) !== levelNo) errors.push(`Dòng ${line}: level "${lv}" không khớp màn ${levelNo}`);
    if (!word) errors.push(`Dòng ${line}: thiếu word`);
    const ms = (meanings ?? "").split("|").map((x) => x.trim()).filter(Boolean);
    if (!ms.length) errors.push(`Dòng ${line}: thiếu meanings_vi`);
    const key = (word ?? "").toLowerCase();
    if (key && seen.has(key)) errors.push(`Dòng ${line}: từ "${word}" bị trùng trong file`);
    seen.add(key);
    words.push({ word, ipa: ipa || null, part_of_speech: pos || null, meanings_vi: ms, example_en: ex || null, example_vi: exVi || null });
  });
  return { words: errors.length ? [] : words, errors };
}
