"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { play } from "@/lib/sfx";
import { refreshCoins } from "@/components/coins";
import { btnGhost, btnPrimary } from "./ui";

export const RPC_MSG: Record<string, string> = {
  NOT_ENOUGH_COINS: "Không đủ xu", NOT_ENOUGH_ITEM: "Thiếu vật phẩm cần thiết", ITEM_LOCKED: "Chưa mở khóa", ALREADY_OWNED: "Bạn đã có rồi",
  ARMY_FULL: "Hết chỗ chứa quân – hãy nâng cấp nhà", MAX_LEVEL: "Đã đạt cấp tối đa", HOUSE_DAMAGED: "Hãy sửa nhà đầy HP trước", INVALID_HP: "Số HP không hợp lệ",
  INVALID_NAME: "Tên không hợp lệ", SHIELD_ACTIVE: "Đang có khiên rồi", NO_SHIELD: "Bạn không còn khiên", SHIELD_LIMIT: "Hôm nay bạn đã mua khiên rồi",
  ATTACK_LIMIT: "Hôm nay bạn đã hết lượt tấn công", TARGET_SHIELDED: "Người ấy đang có khiên", TARGET_PROTECTED: "Người ấy vừa bị tấn công, đang được bảo hộ",
  TARGET_RUINED: "Nhà người ấy đã đổ nát", NO_ARMY: "Bạn chưa có lính nào",
  NO_FACTORY: "Cần xây nhà máy của loại lính này trước", UNIT_RETIRED: "Lính giờ phải luyện ở nhà máy", INVALID_QTY: "Số lượng không hợp lệ",
  OVERLAP_OBSTACLE: "Vướng vật cản — hãy dọn trước", ALREADY_CLEARED: "Vật cản này đã được dọn", ITEM_RETIRED: "Món này không còn bán", PET_NOT_FOUND: "Không tìm thấy thú cưng",
  DEFENSE_LIMIT: "Đã đủ số lượng cho cấp nhà này", INVALID_TARGET: "Không tấn công được người này", NOT_AUTHENTICATED: "Bạn cần đăng nhập lại",
  DECOR_LIMIT: "Đã đủ số lượng tối đa cho món này", ITEM_NOT_FOUND: "Không tìm thấy món này", INVALID_LAYOUT: "Bố cục không hợp lệ", NO_HOUSE: "Bạn chưa có nhà",
  OUT_OF_BOUNDS: "Ra ngoài căn cứ rồi", OVERLAP_HOUSE: "Không đặt đè lên nhà được", OVERLAP: "Có vật đặt đè lên nhau", ITEM_NOT_OWNED: "Bạn không còn sở hữu vật này", DUPLICATE_ITEM: "Vật bị đặt 2 lần",
};

// Nút gọi RPC dùng chung (shop, căn cứ, khiên, tấn công)
export function RpcButton({ fn, args, label, disabledReason, confirm: ask, ghost, onDone, small }: {
  fn: string; args?: Record<string, unknown>; label: string; disabledReason?: string | null; confirm?: string; ghost?: boolean; small?: boolean;
  onDone?: (data: unknown) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function go() {
    if (ask && !window.confirm(ask)) return;
    setBusy(true); setMsg(null);
    const { data, error } = await createClient().rpc(fn, args ?? {});
    setBusy(false);
    if (error) { play("wrong"); return setMsg({ ok: false, t: RPC_MSG[error.message] ?? "Không thực hiện được" }); }
    play("coin"); setMsg({ ok: true, t: "Xong ✅" }); onDone?.(data); void refreshCoins(); router.refresh();
  }
  const cls = `${ghost ? btnGhost : btnPrimary} ${small ? "!px-3 !py-1 text-sm" : ""}`;
  return (
    <div className="space-y-1">
      <button disabled={busy || !!disabledReason} onClick={go} title={disabledReason ?? undefined} className={cls}>{busy ? "…" : label}</button>
      {disabledReason && <p className="text-xs font-semibold text-amber-700">{disabledReason}</p>}
      {msg && <p role="status" className={`text-xs font-semibold ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.t}</p>}
    </div>
  );
}
