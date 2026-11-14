"use client";
// Popup khi chạm vào mô hình trong căn cứ 3D (BASE-01..06): nâng cấp nhà / thú cưng / quân, sửa nhà, xem công trình.
// Mọi thay đổi xu đi qua RPC ở server; xu hiển thị cập nhật ngay (refreshCoins + Realtime).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RPC_MSG } from "@/components/rpc-button";
import { refreshCoins } from "@/components/coins";
import { play } from "@/lib/sfx";
import type { BaseData, SceneItem } from "@/lib/base";
import type { Econ } from "./base-scene";
import { EVO_NAMES } from "@/components/three/pets";
import { HOUSE_NAMES } from "@/components/three/models";

const btn = "rounded-xl bg-pink-500 px-3 py-2 text-xs font-extrabold text-white shadow disabled:bg-slate-300";
const ghost = "rounded-xl bg-pink-50 px-3 py-2 text-xs font-extrabold text-pink-700 disabled:opacity-40";
const KIND_LABEL: Record<string, string> = { DEFENSE: "Công trình phòng thủ", TRAP: "Bẫy (người ấy không nhìn thấy)", WALL: "Tường thành", DECOR: "Đồ trang trí", WEAPON: "Vũ khí (vẫn +% ATK)", FACTORY: "Nhà máy luyện quân" };

export type Picked = { kind: "house" } | { kind: "item"; item: SceneItem };

export function ObjectPanel({ picked, data, econ, coins, onClose, onMove, onTrain }: {
  picked: Picked; data: BaseData; econ: Econ; coins: number; onClose: () => void; onMove: (key: string) => void; onTrain: (factory: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [name, setName] = useState(picked.kind === "item" ? picked.item.nickname ?? "" : "");

  async function act(id: string, fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(id); setMsg(null);
    const { error } = await createClient().rpc(fn, args);
    setBusy(null);
    if (error) { play("wrong"); return setMsg({ ok: false, t: RPC_MSG[error.message] ?? "Không thực hiện được" }); }
    play("coin"); setMsg({ ok: true, t: ok }); void refreshCoins(); router.refresh();
  }
  const lack = (price: number) => (coins < price ? `Thiếu ${(price - coins).toLocaleString("vi-VN")} xu` : null);

  let title = "", emoji = "", body: React.ReactNode = null;
  if (picked.kind === "house") {
    const h = data.house, missing = h.max_hp - h.hp, full = missing * econ.repairPerHp, half = Math.ceil(missing / 2);
    emoji = "🏠"; title = `Nhà cấp ${h.level}: ${HOUSE_NAMES[h.level] ?? econ.houseName}`;
    body = (
      <>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${h.hp / h.max_hp < 0.3 ? "bg-red-500" : h.hp / h.max_hp < 0.6 ? "bg-amber-400" : "bg-green-500"}`} style={{ width: `${(h.hp / Math.max(1, h.max_hp)) * 100}%` }} /></div>
        <p className="text-xs font-semibold text-slate-600">HP {h.hp.toLocaleString("vi-VN")}/{h.max_hp.toLocaleString("vi-VN")} · DEF {econ.houseDef} · chứa {econ.used}/{econ.cap} chỗ quân</p>
        {missing > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button className={btn} disabled={!!busy || !!lack(full)} onClick={() => act("rf", "repair_house", { p_hp: missing }, "Đã sửa nhà đầy HP 🔧")} data-testid="repair-full">🔧 Sửa hết · 🪙 {full.toLocaleString("vi-VN")}</button>
            {half > 0 && half < missing && <button className={ghost} disabled={!!busy || !!lack(half * econ.repairPerHp)} onClick={() => act("rh", "repair_house", { p_hp: half }, `Đã sửa ${half} HP`)}>Sửa một nửa · 🪙 {(half * econ.repairPerHp).toLocaleString("vi-VN")}</button>}
          </div>
        ) : <p className="text-xs font-bold text-green-700">Nhà đầy HP ✅</p>}
        {econ.next ? (
          <div className="rounded-xl bg-pink-50/70 p-2 text-xs">
            <div className="font-extrabold text-pink-700">⬆️ Lên cấp {h.level + 1}: {econ.next.name}</div>
            <div className="text-slate-600">HP {econ.next.maxHp.toLocaleString("vi-VN")} · DEF {econ.next.def} · thêm chỗ quân, nền nhà to hơn</div>
            <button className={`${btn} mt-1`} disabled={!!busy || missing > 0 || !!lack(econ.next.price)} onClick={() => act("up", "upgrade_house", {}, `Nhà đã lên cấp ${h.level + 1}! 🎉`)} data-testid="upgrade-house">
              {missing > 0 ? "Sửa đầy HP trước" : lack(econ.next.price) ?? `Nâng cấp · 🪙 ${econ.next.price.toLocaleString("vi-VN")}`}
            </button>
          </div>
        ) : <p className="text-xs font-bold text-pink-700">💒 Nhà đã đạt cấp tối đa</p>}
      </>
    );
  } else {
    const it = picked.item;
    emoji = it.emoji; title = it.nickname ?? it.name;
    if (it.kind === "PET") {
      const lv = it.level ?? 1, cost = econ.petStep * lv, maxed = lv >= econ.petMax;
      const reason = maxed ? "Đã tối đa" : econ.tokens.pet < 1 ? "Cần 1 🐾 Nâng cấp thú cưng" : lack(cost);
      body = (
        <>
          <p className="text-xs font-semibold text-slate-600">{it.name} · cấp {lv}/{econ.petMax} · {EVO_NAMES[lv]}<br />✨ {econ.petBuff[it.code] ?? ""}</p>
          {!maxed && <p className="text-[11px] text-slate-500">Lên cấp {lv + 1}: {lv + 1 === 3 ? "TIẾN HOÁ đổi hình dạng" : lv + 1 === 4 ? "có vòng hào quang" : lv + 1 === 5 ? "vương miện + lấp lánh" : "to hơn"} · còn {econ.tokens.pet} 🐾</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button className={btn} disabled={!!busy || !!reason} onClick={() => act("pet", "upgrade_pet", { p_id: it.ref }, `${it.nickname ?? it.name} lên cấp ${lv + 1}! ✨`)} data-testid="upgrade-pet">{reason ?? `⬆️ Nâng cấp · 🪙 ${cost.toLocaleString("vi-VN")} + 1 🐾`}</button>
          </div>
          <div className="flex gap-2">
            <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-pink-200 px-2 py-1 text-xs font-bold" aria-label="Tên thú cưng" />
            <button className={ghost} disabled={!!busy || !name.trim() || name === it.nickname} onClick={() => act("rn", "rename_pet", { p_id: it.ref, p_name: name.trim() }, "Đã đổi tên 💕")}>Đổi tên</button>
          </div>
        </>
      );
    } else if (it.kind === "UNIT") {
      const next = econ.armyLevel + 1, cost = econ.armyStep * next, maxed = econ.armyLevel >= econ.armyMax;
      const reason = maxed ? "Đã tối đa" : econ.tokens.army < 1 ? "Cần 1 🪖 Nâng cấp quân đội" : lack(cost);
      const fac = `fac_${it.code}`, hasFac = data.items.some((i) => i.kind === "FACTORY" && i.ref === fac);
      body = (
        <>
          <p className="text-xs font-semibold text-slate-600">Đội {it.name} ×{it.qty} · cấp quân {econ.armyLevel}/{econ.armyMax} (+{Math.round(econ.armyPct * econ.armyLevel * 100)}% ATK, chung cho mọi loại lính) · còn {econ.tokens.army} 🪖</p>
          <div className="flex flex-wrap gap-2">
            <button className={btn} disabled={!!busy || !!reason} onClick={() => act("army", "upgrade_army", {}, `Quân đội lên cấp ${next}! 💪`)} data-testid="upgrade-army">{reason ?? `⬆️ Nâng cấp quân · 🪙 ${cost.toLocaleString("vi-VN")} + 1 🪖`}</button>
            {hasFac && <button className={ghost} onClick={() => onTrain(fac)}>⚒️ Luyện thêm ở nhà máy</button>}
          </div>
        </>
      );
    } else {
      body = (
        <>
          <p className="text-xs font-semibold text-slate-600">{KIND_LABEL[it.kind] ?? ""}{it.desc ? ` · ${it.desc}` : ""}{it.range ? ` · ${it.kind === "TRAP" ? "kích hoạt" : "tầm bắn"} ${it.range} m` : ""}</p>
          <button className={ghost} onClick={() => onMove(`${it.kind}:${it.ref}`)}>🔨 Di chuyển</button>
        </>
      );
    }
  }
  return (
    <div className="absolute inset-x-3 bottom-3 z-20 mx-auto max-w-md space-y-2 rounded-2xl bg-white/95 p-3 shadow-xl" data-testid="object-panel">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{emoji}</span>
        <b className="min-w-0 flex-1 truncate text-pink-700">{title}</b>
        <button onClick={onClose} aria-label="Đóng" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pink-50 text-base font-black text-pink-700" data-testid="panel-close">✕</button>
      </div>
      {body}
      {msg && <p role="status" className={`text-xs font-bold ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.t}</p>}
    </div>
  );
}
