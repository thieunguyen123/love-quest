import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string; display_name: string; bio: string; birthday: string | null; favorite_color: string;
  avatar_url: string | null; role: "ADMIN" | "PLAYER"; coins: number; army_level: number; onboarded_at: string | null;
};

// Lấy người dùng hiện tại + profile + người ấy. Chưa onboarding → chuyển sang /onboarding.
export async function requirePlayer(opts: { allowUnonboarded?: boolean } = {}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!me) redirect("/login");
  if (!me.onboarded_at && !opts.allowUnonboarded) redirect("/onboarding");
  const { data: couple } = await supabase.from("couples").select("*").or(`player_a.eq.${user.id},player_b.eq.${user.id}`).maybeSingle();
  let partner: Profile | null = null;
  if (couple) {
    const pid = couple.player_a === user.id ? couple.player_b : couple.player_a;
    const { data } = await supabase.from("profiles").select("*").eq("id", pid).maybeSingle<Profile>();
    partner = data;
  }
  return { supabase, user, me, partner, couple };
}

export async function requireAdmin() {
  const ctx = await requirePlayer();
  if (ctx.me.role !== "ADMIN") redirect("/403");
  return ctx;
}
