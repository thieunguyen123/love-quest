"use client";
import { useActionState } from "react";
import { Card, btnPrimary, inputCls } from "@/components/ui";
import { resetSeason } from "../actions";

export default function SeasonReset() {
  const [state, action, pending] = useActionState(resetSeason, undefined);
  return (
    <Card className="space-y-3 border-red-200">
      <p className="text-sm">Xoá <b>toàn bộ tiến trình game</b>: điểm, xu, nhà, thú cưng, quân, vũ khí, khiên, trận đánh, thông báo — rồi mở lại từ màn 1. Mỗi người nhận lại xu khởi đầu.</p>
      <p className="text-sm"><b>Giữ nguyên:</b> tài khoản, hồ sơ, từ vựng, bài ngữ pháp, cấu hình, sổ từ.</p>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input name="confirm" placeholder='Gõ "RESET" để xác nhận' className={`${inputCls} !w-64`} aria-label="Xác nhận reset" />
        <button disabled={pending} className={`${btnPrimary} !bg-red-600 hover:!bg-red-700`}>{pending ? "Đang reset…" : "Reset mùa giải"}</button>
      </form>
      {state && <p role="status" className={`text-sm font-bold ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</p>}
    </Card>
  );
}
