/* eslint-disable @typescript-eslint/no-explicit-any */
// Nạp bài ngữ pháp (GRM-01..03) từ supabase/seed/grammar_b*.json — chỉ đụng tới bảng grammar_*, an toàn chạy lại trên production:
//   IT_ENV=.env.prod npx tsx scripts/seed-grammar.ts
// Câu hỏi upsert theo (bài, thứ tự) để id ổn định; câu thừa (đã xoá khỏi file) bị xoá.
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const SEED = path.join(__dirname, "..", "supabase", "seed");

export function loadGrammar(): any[] {
  return fs.readdirSync(SEED).filter((f) => /^grammar_.*\.json$/.test(f)).sort()
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(SEED, f), "utf8")))
    .sort((a, b) => a.order_no - b.order_no);
}

export async function seedGrammar(sb: any) {
  const lessons = loadGrammar();
  let qn = 0;
  for (const l of lessons) {
    const { data, error } = await sb.from("grammar_lessons").upsert({
      code: l.code, order_no: l.order_no, band: l.band, emoji: l.emoji, title_vi: l.title_vi, title_en: l.title_en ?? "",
      summary_vi: l.summary_vi ?? "", sections: l.sections ?? [], tips: l.tips ?? [],
    } as any, { onConflict: "code" }).select("id").single();
    if (error) throw new Error(`${l.code}: ${error.message}`);
    const id = (data as any).id as string;
    const qs = (l.questions as any[]).map((q, idx) => ({ lesson_id: id, idx, q: q.q, options: q.options, answer: q.answer, explain_vi: q.explain_vi ?? "" }));
    const r = await sb.from("grammar_questions").upsert(qs as any, { onConflict: "lesson_id,idx" });
    if (r.error) throw new Error(`${l.code} câu hỏi: ${r.error.message}`);
    await sb.from("grammar_questions").delete().eq("lesson_id", id).gte("idx", qs.length);
    qn += qs.length;
  }
  return { lessons: lessons.length, questions: qn };
}

if (require.main === module) {
  config({ path: path.resolve(__dirname, "..", process.env.IT_ENV ?? ".env.local") });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  seedGrammar(sb).then((r) => console.log("Ngữ pháp:", r), (e) => { console.error(e); process.exit(1); });
}
