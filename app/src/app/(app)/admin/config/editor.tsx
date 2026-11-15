"use client";
// ADM-03: sửa game_config theo nhóm; mô tả tiếng Việt là tên chính, key là chữ nhỏ; true/false dùng công tắc, số dùng ô số.
import { useActionState, useMemo, useState } from "react";
import { Card, btnGhost, inputCls } from "@/components/ui";
import { setConfig } from "../actions";
import { CONFIG_GROUPS, groupOf } from "./groups";

type Row = { key: string; value: string; unit: string; description: string };

function Line({ r }: { r: Row }) {
  const [state, action, pending] = useActionState(setConfig, undefined);
  const isBool = r.value === "true" || r.value === "false";
  const isNum = !isBool && r.value !== "" && !Number.isNaN(Number(r.value));
  const [v, setV] = useState(r.value);
  const dirty = v !== r.value && !state?.ok;
  return (
    <form action={action} className="grid grid-cols-12 items-center gap-2 border-t border-love-100 py-2 first:border-t-0" data-testid={`cfg-${r.key}`}>
      <input type="hidden" name="key" value={r.key} />
      <div className="col-span-12 sm:col-span-7">
        <div className="text-sm font-semibold leading-snug">{r.description || r.key}</div>
        <div className="font-mono text-[11px] text-love-700/50">{r.key}</div>
      </div>
      <div className="col-span-7 flex items-center gap-2 sm:col-span-3">
        {isBool ? (
          <>
            <input type="hidden" name="value" value={v} />
            <button type="button" onClick={() => setV(v === "true" ? "false" : "true")} role="switch" aria-checked={v === "true"} aria-label={r.key}
              className={`relative h-7 w-12 rounded-full transition ${v === "true" ? "bg-green-500" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${v === "true" ? "left-[22px]" : "left-0.5"}`} />
            </button>
            <span className="text-xs font-bold">{v === "true" ? "Bật" : "Tắt"}</span>
          </>
        ) : (
          <input name="value" value={v} onChange={(e) => setV(e.target.value)} inputMode={isNum ? "decimal" : "text"} className={`${inputCls} !py-1 font-mono`} aria-label={r.key} />
        )}
        {r.unit && <span className="shrink-0 text-xs text-love-700/60">{r.unit}</span>}
      </div>
      <div className="col-span-5 flex items-center justify-end gap-2 sm:col-span-2">
        {state && <span className={`text-xs font-bold ${state.ok ? "text-green-700" : "text-red-600"}`} title={state.message}>{state.ok ? "✓ Đã lưu" : "Lỗi"}</span>}
        <button disabled={pending || !dirty} className={`${btnGhost} !px-3 !py-1 text-sm disabled:opacity-40`}>{pending ? "…" : "Lưu"}</button>
      </div>
      {state && !state.ok && <div className="col-span-12 text-xs font-bold text-red-600">{state.message}</div>}
    </form>
  );
}

export default function ConfigEditor({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hit = rows.filter((r) => !s || r.key.toLowerCase().includes(s) || r.description.toLowerCase().includes(s));
    return [...CONFIG_GROUPS, { id: "other", icon: "🧩", title: "Khác", keys: /$^/ }]
      .map((g) => ({ ...g, rows: hit.filter((r) => groupOf(r.key) === g.id) }))
      .filter((g) => g.rows.length);
  }, [rows, q]);
  return (
    <>
      <div className="sticky top-16 z-10 -mx-1 bg-[var(--background,#fff7fb)]/90 px-1 py-1 backdrop-blur md:top-20">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Tìm theo mô tả hoặc key (vd: khiên, xu, TYPING)…" className={inputCls} aria-label="Tìm cấu hình" />
      </div>
      {!groups.length && <Card className="text-sm">Không có cấu hình nào khớp “{q}”.</Card>}
      {groups.map((g) => (
        <details key={g.id} open={!!q || g.id === groups[0]?.id} className="group rounded-2xl border border-love-100 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-extrabold text-love-700">
            <span className="text-xl">{g.icon}</span><span className="flex-1">{g.title}</span>
            <span className="rounded-full bg-love-50 px-2 text-xs">{g.rows.length}</span><span className="transition group-open:rotate-90">›</span>
          </summary>
          <div className="px-4 pb-2">{g.rows.map((r) => <Line key={r.key} r={r} />)}</div>
        </details>
      ))}
    </>
  );
}
