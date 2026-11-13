"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { RpcButton } from "@/components/rpc-button";
import { formatLeft } from "@/lib/time";

type Shield = { id: string; source: string; granted_date: string; activated_at: string | null; expires_at: string | null; broken_at: string | null };

export function ShieldPanel({ shields, hours }: { shields: Shield[]; freeCfg: number; hours: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const active = shields.find((s) => s.activated_at && !s.broken_at && s.expires_at && Date.parse(s.expires_at) > (now ?? 0));
  const unused = shields.filter((s) => !s.activated_at && (s.source === "PAID" || s.granted_date === today));
  const free = unused.filter((s) => s.source === "FREE").length, paid = unused.filter((s) => s.source === "PAID").length;
  return (
    <Card className="flex flex-wrap items-center gap-4">
      <div className="text-4xl">{active ? "🛡️" : "🔓"}</div>
      <div className="flex-1 min-w-48">
        <div className="font-extrabold text-love-700">{active ? "Khiên đang bật" : "Chưa bật khiên"}</div>
        <div className="text-sm">{active && now ? <>Còn <b>{formatLeft(Date.parse(active.expires_at!) - now)}</b> — người ấy không tấn công được bạn.</> : `Khiên kéo dài ${hours} giờ. Còn ${free} khiên miễn phí hôm nay (hết ngày mất) + ${paid} khiên đã mua.`}</div>
      </div>
      {!active && <RpcButton fn="activate_shield" label="🛡️ Bật khiên" disabledReason={free + paid === 0 ? "Hết khiên – mua thêm ở cửa hàng" : null} />}
    </Card>
  );
}
