import { notFound, redirect } from "next/navigation";
import { requirePlayer } from "@/lib/session";
import Flashcards from "./flashcards";

export default async function FlashcardPage({ params }: { params: Promise<{ order: string }> }) {
  const { order } = await params;
  const { supabase, me } = await requirePlayer();
  const { data: level } = await supabase.from("levels").select("*").eq("order_no", Number(order)).maybeSingle();
  if (!level) notFound();
  if (level.status === "LOCKED") redirect("/learn");
  const { data: words } = await supabase.from("words").select("*").eq("level_id", level.id).order("word");
  const { data: prog } = await supabase.from("word_progress").select("word_id,status").eq("user_id", me.id);
  const { data: sp } = await supabase.from("study_progress").select("bonus_claimed").eq("user_id", me.id).eq("level_id", level.id).maybeSingle();
  return (
    <Flashcards
      level={{ id: level.id, order_no: level.order_no, topic_vi: level.topic_vi, topic_en: level.topic_en }}
      words={words ?? []}
      known={(prog ?? []).filter((p) => p.status === "MASTERED").map((p) => p.word_id)}
      bonusClaimed={!!sp?.bonus_claimed}
    />
  );
}
