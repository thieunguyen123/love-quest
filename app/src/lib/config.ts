import type { SupabaseClient } from "@supabase/supabase-js";
import type { TypingCfg } from "@/lib/game/typing";

export async function loadConfig(supabase: SupabaseClient): Promise<Record<string, number | string | boolean>> {
  const { data } = await supabase.from("game_config").select("key,value");
  const out: Record<string, number | string | boolean> = {};
  for (const r of data ?? []) out[r.key] = r.value;
  return out;
}

export function typingCfg(c: Record<string, number | string | boolean>): TypingCfg {
  const n = (k: string) => Number(c[k]);
  return {
    lives: n("TYPING_LIVES"), fallStartSec: n("TYPING_FALL_START_SEC"), fallMinSec: n("TYPING_FALL_MIN_SEC"),
    speedupPct: n("TYPING_SPEEDUP_PCT"), speedupEvery: n("TYPING_SPEEDUP_EVERY"),
    maxStart: n("TYPING_MAX_ON_SCREEN_START"), maxEnd: n("TYPING_MAX_ON_SCREEN_END"),
    rewardEvery: n("TYPING_REWARD_EVERY"), rewardCoins: n("TYPING_REWARD_COINS"), dailyCap: n("TYPING_DAILY_CAP"),
    noDiacritics: c["TYPING_ALLOW_NO_DIACRITICS"] === true || c["TYPING_ALLOW_NO_DIACRITICS"] === "TRUE",
    spawnGapStartSec: Number(c["TYPING_SPAWN_GAP_START_SEC"] ?? 3.5) || 3.5, spawnGapMinSec: Number(c["TYPING_SPAWN_GAP_MIN_SEC"] ?? 1.2) || 1.2,
  };
}
