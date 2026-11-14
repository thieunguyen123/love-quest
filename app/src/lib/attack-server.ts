// Phần gắn với Next.js của trận đánh: xác định người đang đăng nhập (cookie phiên) + service client. Logic ở attack-core.ts
import { createClient as createService } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const serviceClient = () =>
  createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** Người đang đăng nhập + người ấy */
export async function currentPair(): Promise<{ me: string; partner: string | null } | null> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: couple } = await sb.from("couples").select("player_a,player_b").or(`player_a.eq.${user.id},player_b.eq.${user.id}`).maybeSingle();
  return { me: user.id, partner: couple ? (couple.player_a === user.id ? couple.player_b : couple.player_a) : null };
}
