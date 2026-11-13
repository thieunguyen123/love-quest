import { describe, it, expect } from "vitest";
import { parseCsv, parseWordsCsv } from "./csv";

const H = "level,word,ipa,part_of_speech,meanings_vi,example_en,example_vi";
describe("csv", () => {
  it("parse ô có dấu phẩy và ngoặc kép", () => {
    expect(parseCsv('a,"b,c","d ""x"""\n1,2,3')).toEqual([["a", "b,c", 'd "x"'], ["1", "2", "3"]]);
  });
  it("import hợp lệ", () => {
    const r = parseWordsCsv(`${H}\n1,hello,/x/,interj,xin chào|chào,"Hello, you.",Xin chào`, 1);
    expect(r.errors).toEqual([]);
    expect(r.words[0].meanings_vi).toEqual(["xin chào", "chào"]);
    expect(r.words[0].example_en).toBe("Hello, you.");
  });
  it("báo lỗi từng dòng và không import nửa vời", () => {
    const r = parseWordsCsv(`${H}\n2,hello,,,xin chào,,\n1,,,,,,\n1,hi,,,chào,,\n1,HI,,,chào,,`, 1);
    expect(r.words).toEqual([]);
    expect(r.errors.length).toBe(4);
    expect(r.errors[0]).toContain("Dòng 2");
  });
  it("sai header", () => {
    expect(parseWordsCsv("a,b\n1,2", 1).errors[0]).toContain("Header");
  });
});
