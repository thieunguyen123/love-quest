import { redirect } from "next/navigation";
import { requirePlayer } from "@/lib/session";
import { loadConfig } from "@/lib/config";
import PlayClient from "./play-client";

export default async function PlayPage({ params, searchParams }: { params: Promise<{ order: string }>; searchParams: Promise<{ attempt?: string; practice?: string }> }) {
  const { order } = await params; const sp = await searchParams;
  const { supabase, me } = await requirePlayer();
  if (!sp.attempt) redirect(`/levels/${order}`);
  const { data: a } = await supabase.from("level_attempts").select("id,status,mode").eq("id", sp.attempt).eq("user_id", me.id).maybeSingle();
  if (!a) redirect(`/levels/${order}`);
  if (a.status === "SUBMITTED") redirect(`/levels/${order}/result?attempt=${a.id}`);
  const cfg = await loadConfig(supabase);
  return <PlayClient attemptId={a.id} order={Number(order)} practice={a.mode === "PRACTICE"} revealMs={Number(cfg.ANSWER_REVEAL_MS ?? 1500)} />;
}
