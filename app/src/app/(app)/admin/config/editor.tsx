"use client";
import { useActionState, useState } from "react";
import { Card, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { resetSeason, setConfig } from "../actions";

type Row = { key: string; value: string; unit: string; description: string };

function Line({ r }: { r: Row }) {
  const [state, action, pending] = useActionState(setConfig, undefined);
  return (
    <form action={action} className="grid grid-cols-12 gap-2 items-center py-1.5 border-t border-love-100">
      <input type="hidden" name="key" value={r.key} />
      <div className="col-span-12 sm:col-span-4 font-mono text-xs font-bold break-all">{r.key}</div>
      <input name="value" defaultValue={r.value} className={`${inputCls} col-span-5 sm:col-span-2 !py-1 font-mono`} aria-label={r.key} />
      <div className="col-span-2 sm:col-span-1 text-xs">{r.unit}</div>
      <button disabled={pending} className={`${btnGhost} col-span-3 sm:col-span-1 !py-1 text-sm`}>Lưu</button>
      <div className="col-span-12 sm:col-span-4 text-xs text-love-700/70">{state ? <b className={state.ok ? "text-green-700" : "text-red-600"}>{state.message}</b> : r.description}</div>
    </form>
  );
}

export default function ConfigEditor({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [state, action, pending] = useActionState(resetSeason, undefined);
  return (
    <>
      <Card className="space-y-1">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm key…" className={inputCls} aria-label="Tìm key cấu hình" />
        {rows.filter((r) => r.key.toLowerCase().includes(q.toLowerCase())).map((r) => <Line key={r.key} r={r} />)}
      </Card>
      <Card className="space-y-2 border-red-200">
        <h2 className="font-extrabold text-red-700">⚠️ Reset mùa giải</h2>
        <p className="text-sm">Xóa toàn bộ tiến trình game (điểm, xu, nhà, thú cưng, quân, vũ khí, khiên, trận đánh, thông báo) và mở lại từ màn 1. <b>Giữ</b> tài khoản, hồ sơ, từ vựng, cấu hình, sổ từ. Mỗi người nhận lại xu khởi đầu.</p>
        <form action={action} className="flex flex-wrap gap-2 items-center">
          <input name="confirm" placeholder='Gõ "RESET" để xác nhận' className={`${inputCls} !w-64`} aria-label="Xác nhận reset" />
          <button disabled={pending} className={`${btnPrimary} !bg-red-600 hover:!bg-red-700`}>Reset mùa giải</button>
        </form>
        {state && <p role="status" className={`text-sm font-bold ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</p>}
      </Card>
    </>
  );
}
