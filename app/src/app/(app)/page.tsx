import Link from "next/link";
import { requirePlayer } from "@/lib/session";
import { Avatar, Card, ButtonLink } from "@/components/ui";

const VN_TZ = "Asia/Ho_Chi_Minh";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(d); // yyyy-mm-dd theo giờ VN

export default async function HubPage() {
  const { supabase, me, partner, couple } = await requirePlayer();
  const { data: levels } = await supabase.from("levels").select("order_no,topic_vi,status").order("order_no");
  const current = levels?.find((l) => l.status === "OPEN" || l.status === "COUNTDOWN");
  const days = couple ? Math.max(0, Math.round((Date.parse(dayKey(new Date())) - Date.parse(couple.started_at)) / 86400000)) : null;

  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-around gap-4 text-center">
        <Link href={`/profile/${me.id}`} className="space-y-1">
          <div className="flex justify-center"><Avatar url={me.avatar_url} name={me.display_name} color={me.favorite_color} size={64} /></div>
          <div className="font-extrabold">{me.display_name}</div>
        </Link>
        <div className="space-y-1">
          <div className="text-3xl">💕</div>
          {days !== null && <div className="text-sm font-bold text-love-600">Đã bên nhau {days} ngày</div>}
        </div>
        {partner ? (
          <Link href={`/profile/${partner.id}`} className="space-y-1">
            <div className="flex justify-center"><Avatar url={partner.avatar_url} name={partner.display_name} color={partner.favorite_color} size={64} /></div>
            <div className="font-extrabold">{partner.display_name || "Người ấy"}</div>
          </Link>
        ) : <div className="text-sm text-love-700/70">Chưa ghép cặp</div>}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-extrabold text-love-700">🏆 Màn hiện tại</h2>
          {current ? (
            <>
              <p>Màn {current.order_no}: <b>{current.topic_vi}</b></p>
              <p className="text-sm text-love-700/70">Thi đấu sẽ mở ở Phase 4. Bây giờ học trước nhé!</p>
              <ButtonLink href={`/learn/${current.order_no}`}>Học trước</ButtonLink>
            </>
          ) : <p>Chưa có màn nào được mở.</p>}
        </Card>
        <Card className="space-y-3">
          <h2 className="font-extrabold text-love-700">📚 Học từ vựng</h2>
          <p>Flashcard có phát âm. Học hết một chủ đề lần đầu được thưởng xu.</p>
          <ButtonLink href="/learn" ghost>Mở thư viện</ButtonLink>
        </Card>
        {["🌧️ Mưa chữ", "🏠 Căn cứ", "🛒 Cửa hàng", "⚔️ Đối đầu"].map((t) => (
          <Card key={t} className="opacity-60"><h2 className="font-extrabold text-love-700">{t}</h2><p className="text-sm">Sắp ra mắt</p></Card>
        ))}
      </div>
    </div>
  );
}
