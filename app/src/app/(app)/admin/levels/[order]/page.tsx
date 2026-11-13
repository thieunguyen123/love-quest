import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import LevelEditor from "./editor";

export default async function AdminLevelPage({ params }: { params: Promise<{ order: string }> }) {
  const { order } = await params;
  const { supabase } = await requireAdmin();
  const { data: level } = await supabase.from("levels").select("*").eq("order_no", Number(order)).maybeSingle();
  if (!level) notFound();
  const { data: words } = await supabase.from("words").select("*").eq("level_id", level.id).order("word");
  return (
    <div className="space-y-4">
      <Link href="/admin/levels" className="text-sm font-bold text-love-600">← Danh sách màn</Link>
      <LevelEditor level={level} words={words ?? []} locked={!["OPEN", "LOCKED"].includes(level.status)} />
    </div>
  );
}
