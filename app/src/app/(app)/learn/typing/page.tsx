import { requirePlayer } from "@/lib/session";
import { loadConfig, typingCfg } from "@/lib/config";
import TypingGame from "./game";

export default async function TypingPage() {
  const { supabase, me, partner } = await requirePlayer();
  const [cfg, { data: levels }, { data: words }, { data: prog }, { data: daily }, { data: recMe }, { data: recPartner }] = await Promise.all([
    loadConfig(supabase),
    supabase.from("levels").select("id,order_no,topic_vi").neq("status", "LOCKED").order("order_no"),
    supabase.from("words").select("id,level_id,word,meanings_vi"),
    supabase.from("word_progress").select("word_id,wrong_count").eq("user_id", me.id),
    supabase.from("daily_counters").select("typing_coins").eq("user_id", me.id).eq("day", new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())).maybeSingle(),
    supabase.from("typing_sessions").select("words_hit").eq("user_id", me.id).order("words_hit", { ascending: false }).limit(1),
    partner ? supabase.from("typing_sessions").select("words_hit").eq("user_id", partner.id).order("words_hit", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
  ]);
  const wrong = new Map((prog ?? []).map((p) => [p.word_id, p.wrong_count]));
  return (
    <TypingGame
      cfg={typingCfg(cfg)}
      levels={levels ?? []}
      words={(words ?? []).map((w) => ({ id: w.id, levelId: w.level_id, en: w.word, vi: w.meanings_vi as string[], wrong: wrong.get(w.id) ?? 0 }))}
      usedToday={daily?.typing_coins ?? 0}
      myRecord={recMe?.[0]?.words_hit ?? 0}
      partnerRecord={recPartner?.[0]?.words_hit ?? null}
      partnerName={partner?.display_name ?? "Người ấy"}
    />
  );
}
