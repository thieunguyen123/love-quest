import { notFound } from "next/navigation";
import { requirePlayer, type Profile } from "@/lib/session";
import { Avatar, Card, ButtonLink } from "@/components/ui";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await requirePlayer();
  // RLS chỉ cho xem mình và người ấy (không lộ email)
  const { data: p } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle<Profile>();
  if (!p) notFound();
  const [{ count: mastered }, { count: wins }] = await Promise.all([
    supabase.from("word_progress").select("*", { count: "exact", head: true }).eq("user_id", id).eq("status", "MASTERED"),
    supabase.from("levels").select("*", { count: "exact", head: true }).eq("winner_id", id),
  ]);
  const stats = [["Từ đã thuộc", mastered ?? 0], ["Màn thắng", wins ?? 0], ["Xu hiện có", p.coins]] as const;

  return (
    <Card className="max-w-lg mx-auto space-y-5 text-center">
      <div className="flex justify-center"><Avatar url={p.avatar_url} name={p.display_name} color={p.favorite_color} size={110} /></div>
      <div>
        <h1 className="text-2xl font-extrabold">{p.display_name}</h1>
        {p.birthday && <p className="text-sm text-love-700/70">🎂 {new Date(p.birthday).toLocaleDateString("vi-VN")}</p>}
      </div>
      {p.bio && <p className="italic">“{p.bio}”</p>}
      <div className="grid grid-cols-3 gap-2">
        {stats.map(([label, v]) => (
          <div key={label} className="rounded-xl bg-love-50 p-3">
            <div className="text-xl font-extrabold text-love-600">{v.toLocaleString("vi-VN")}</div>
            <div className="text-xs font-semibold">{label}</div>
          </div>
        ))}
      </div>
      {me.id === p.id && <ButtonLink href="/profile/edit">Sửa hồ sơ</ButtonLink>}
    </Card>
  );
}
