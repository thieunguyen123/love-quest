"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { parseWordsCsv } from "@/lib/csv";

type Result = { ok: boolean; message: string; errors?: string[] };

// Mọi ghi dữ liệu admin đi qua RLS (is_admin) + ghi admin_logs ở migration sau
export async function saveLevel(_: Result | undefined, form: FormData): Promise<Result> {
  const { supabase } = await requireAdmin();
  const id = String(form.get("id"));
  const patch = {
    topic_en: String(form.get("topic_en") ?? "").trim(),
    topic_vi: String(form.get("topic_vi") ?? "").trim(),
    cefr: String(form.get("cefr") ?? "").trim(),
    question_count: Number(form.get("question_count")),
    seconds_per_question: Number(form.get("seconds_per_question")),
    reward_multiplier: Number(form.get("reward_multiplier")),
  };
  if (!patch.topic_en || !patch.topic_vi) return { ok: false, message: "Thiếu tên chủ đề" };
  if (!(patch.question_count > 0) || !(patch.seconds_per_question > 0) || !(patch.reward_multiplier > 0)) return { ok: false, message: "Số câu, giây/câu, hệ số thưởng phải > 0" };
  const { data, error } = await supabase.from("levels").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, message: "Không lưu được" };
  if (!data?.length) return { ok: false, message: "Màn đang chơi hoặc đã đóng, không được sửa" };
  revalidatePath("/admin/levels");
  return { ok: true, message: "Đã lưu ✅" };
}

export async function saveWord(_: Result | undefined, form: FormData): Promise<Result> {
  const { supabase } = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const meanings = String(form.get("meanings_vi") ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const row = {
    level_id: String(form.get("level_id")),
    word: String(form.get("word") ?? "").trim(),
    ipa: String(form.get("ipa") ?? "").trim() || null,
    part_of_speech: String(form.get("part_of_speech") ?? "").trim() || null,
    meanings_vi: meanings,
    example_en: String(form.get("example_en") ?? "").trim() || null,
    example_vi: String(form.get("example_vi") ?? "").trim() || null,
  };
  if (!row.word) return { ok: false, message: "Thiếu từ tiếng Anh" };
  if (!meanings.length) return { ok: false, message: "Thiếu nghĩa tiếng Việt" };
  const q = id ? supabase.from("words").update(row).eq("id", id).select("id") : supabase.from("words").insert(row).select("id");
  const { data, error } = await q;
  if (error) return { ok: false, message: error.code === "23505" ? "Từ này đã có trong màn" : "Không lưu được" };
  if (!data?.length) return { ok: false, message: "Màn đang chơi hoặc đã đóng, không được sửa" };
  revalidatePath(`/admin/levels`);
  return { ok: true, message: "Đã lưu ✅" };
}

export async function deleteWord(form: FormData) {
  const { supabase } = await requireAdmin();
  await supabase.from("words").delete().eq("id", String(form.get("id")));
  revalidatePath("/admin/levels");
}

export async function importWords(_: Result | undefined, form: FormData): Promise<Result> {
  const { supabase } = await requireAdmin();
  const levelId = String(form.get("level_id"));
  const levelNo = Number(form.get("order_no"));
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Chưa chọn file CSV" };
  const { words, errors } = parseWordsCsv(await file.text(), levelNo);
  if (errors.length) return { ok: false, message: `Import thất bại: ${errors.length} lỗi, chưa có dòng nào được nhập`, errors };
  // 1 câu lệnh upsert = atomic: lỗi thì không nhập dòng nào
  const { error } = await supabase.from("words").upsert(words.map((w) => ({ ...w, level_id: levelId })), { onConflict: "level_id,word" });
  if (error) return { ok: false, message: "Không import được (màn có thể đang chơi hoặc đã đóng)" };
  revalidatePath("/admin/levels");
  return { ok: true, message: `Đã import ${words.length} từ ✅` };
}
