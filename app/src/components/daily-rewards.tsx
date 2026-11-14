"use client";
// Phần thưởng hằng ngày (sheet 1 mục K): DAY-01 điểm danh 7 ngày · DAY-02 nhiệm vụ · DAY-03 rương chăm chỉ & thưởng đôi.
// Nút 🎁 ở thanh trên (chấm đỏ khi còn quà chưa nhận); lần đầu mở app mỗi ngày tự bật bảng điểm danh.
// Xu chỉ đổi qua RPC ở server (claim_daily_login / claim_quest); tiến độ nhiệm vụ do server tính.
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { RPC_MSG } from "@/components/rpc-button";
import { refreshCoins } from "@/components/coins";
import { play } from "@/lib/sfx";

type Quest = { code: string; emoji: string; title: string; target: number; progress: number; reward: number; optional: boolean; href: string | null; claimed: boolean };
type Status = {
  day: string;
  login: { claimed: boolean; streak: number; length: number; rewards: number[]; last_tokens: number };
  quests: Quest[];
  chest: { ready: boolean; claimed: boolean; coins: number; pet_tokens: number };
  couple: { has_partner: boolean; partner_done: boolean; claimed: boolean; coins: number };
};

const AUTO_KEY = "lq:daily-auto";   // ngày đã tự bật bảng (chỉ tiện ích hiển thị, không ảnh hưởng thưởng)
const btn = "rounded-xl bg-love-500 px-3 py-1.5 text-xs font-extrabold text-white shadow disabled:bg-slate-300";

export function DailyRewards() {
  const [s, setS] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"login" | "quests">("login");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient().rpc("daily_rewards_status");
    if (data) setS(data as Status);
    return data as Status | null;
  }, []);

  useEffect(() => {
    if (window.self !== window.top) return;   // trang trong overlay của làng 3D
    void load().then((d) => {
      if (!d || d.login.claimed) return;
      let seen: string | null = null;
      try { seen = localStorage.getItem(AUTO_KEY); } catch { /* chế độ riêng tư */ }
      if (seen !== d.day) { setTab("login"); setOpen(true); try { localStorage.setItem(AUTO_KEY, d.day); } catch { /* bỏ qua */ } }
    });
    const onVis = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, load]);

  async function claim(id: string, fn: string, args: Record<string, unknown>, ok: (d: { coins: number; pet_tokens?: number }) => string) {
    setBusy(id); setMsg(null);
    const { data, error } = await createClient().rpc(fn, args);
    setBusy(null);
    if (error) { play("wrong"); setMsg({ ok: false, t: RPC_MSG[error.message] ?? "Không nhận được" }); return; }
    play("coin"); setMsg({ ok: true, t: ok(data) }); void refreshCoins(); void load();
  }

  const questReady = s ? s.quests.filter((q) => !q.claimed && q.progress >= q.target).length : 0;
  const pending = !!s && (!s.login.claimed || questReady > 0 || (s.chest.ready && !s.chest.claimed) || (s.chest.claimed && s.couple.partner_done && !s.couple.claimed));

  return (
    <>
      <button onClick={() => { setOpen(true); setMsg(null); setTab(s && s.login.claimed ? "quests" : "login"); }} aria-label="Phần thưởng hằng ngày" title="Điểm danh & nhiệm vụ"
        className="relative grid h-9 w-9 place-items-center rounded-full bg-love-50 text-lg" data-testid="daily-open">
        🎁{pending && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" data-testid="daily-dot" />}
      </button>
      {open && s && createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3" onClick={() => setOpen(false)} data-testid="daily-backdrop">
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="daily-panel">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex flex-1 gap-1 rounded-full bg-love-50 p-1 text-sm font-extrabold">
                {([["login", "📅 Điểm danh"], ["quests", `📋 Nhiệm vụ${questReady ? ` (${questReady})` : ""}`]] as const).map(([k, t]) => (
                  <button key={k} onClick={() => { setTab(k); setMsg(null); void load(); }} className={`flex-1 rounded-full px-3 py-1.5 ${tab === k ? "bg-white text-love-700 shadow" : "text-love-700/70"}`} data-testid={`daily-tab-${k}`}>{t}</button>
                ))}
              </div>
              <button onClick={() => setOpen(false)} aria-label="Đóng" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-love-50 font-black text-love-700">✕</button>
            </div>

            {tab === "login" ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-600">Vào game mỗi ngày để nhận xu — ngày liên tiếp nhận nhiều hơn. Lỡ 1 ngày hoặc xong ngày {s.login.length} thì chuỗi bắt đầu lại.</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {s.login.rewards.map((c, i) => {
                    const d = i + 1, done = d < s.login.streak || (d === s.login.streak && s.login.claimed), today = d === s.login.streak;
                    return (
                      <div key={d} className={`rounded-2xl border-2 p-1.5 text-center ${today ? "border-love-500 bg-love-50" : done ? "border-green-300 bg-green-50" : "border-slate-200"} ${d === s.login.length ? "col-span-2 sm:col-span-1" : ""}`} data-testid={`login-day-${d}`}>
                        <div className="text-[10px] font-bold text-slate-500">Ngày {d}</div>
                        <div className="text-lg">{done ? "✅" : d === s.login.length ? "🎉" : "🪙"}</div>
                        <div className="text-xs font-extrabold text-amber-700">{c}</div>
                        {d === s.login.length && s.login.last_tokens > 0 && <div className="text-[10px] font-bold text-love-600">+{s.login.last_tokens} 🐾</div>}
                      </div>
                    );
                  })}
                </div>
                <button className={`${btn} w-full py-2.5 text-sm`} disabled={s.login.claimed || !!busy} data-testid="claim-login"
                  onClick={() => claim("login", "claim_daily_login", {}, (d) => `Ngày ${s.login.streak}: +${d.coins} xu${d.pet_tokens ? ` +${d.pet_tokens} 🐾` : ""} 🎉`)}>
                  {s.login.claimed ? `Đã điểm danh hôm nay (ngày ${s.login.streak}) — mai quay lại nhé 💕` : `🎁 Nhận ${s.login.rewards[s.login.streak - 1]} xu (ngày ${s.login.streak})`}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500">Làm mới lúc 00:00 mỗi ngày.</p>
                {s.quests.map((q) => {
                  const done = q.progress >= q.target;
                  return (
                    <div key={q.code} className="flex items-center gap-2 rounded-2xl bg-love-50/60 p-2" data-testid={`quest-${q.code}`}>
                      <span className="text-2xl">{q.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold leading-tight">{q.title}{q.optional && <span className="ml-1 text-[10px] font-semibold text-slate-500">(thêm)</span>}</div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white"><div className="h-full bg-love-400" style={{ width: `${(q.progress / q.target) * 100}%` }} /></div>
                        <div className="text-[11px] font-semibold text-slate-500">{q.progress}/{q.target} · 🪙 {q.reward}</div>
                      </div>
                      {q.claimed ? <span className="text-xs font-extrabold text-green-700">✅ Đã nhận</span>
                        : done ? <button className={btn} disabled={!!busy} onClick={() => claim(q.code, "claim_quest", { p_code: q.code }, (d) => `+${d.coins} xu 🎉`)} data-testid={`claim-${q.code}`}>Nhận</button>
                        : q.href ? <Link href={q.href} onClick={() => setOpen(false)} className="rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-love-700 shadow">Làm</Link> : null}
                    </div>
                  );
                })}
                <div className={`flex items-center gap-2 rounded-2xl border-2 p-2 ${s.chest.claimed ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
                  <span className="text-2xl">🧰</span>
                  <div className="min-w-0 flex-1 text-sm font-bold leading-tight">Rương chăm chỉ<div className="text-[11px] font-semibold text-slate-500">Nhận hết nhiệm vụ (trừ mục “thêm”) · 🪙 {s.chest.coins}{s.chest.pet_tokens ? ` + ${s.chest.pet_tokens} 🐾` : ""}</div></div>
                  {s.chest.claimed ? <span className="text-xs font-extrabold text-green-700">✅ Đã mở</span>
                    : <button className={btn} disabled={!s.chest.ready || !!busy} onClick={() => claim("all", "claim_quest", { p_code: "_ALL" }, (d) => `Rương: +${d.coins} xu${d.pet_tokens ? ` +${d.pet_tokens} 🐾` : ""} 🎉`)} data-testid="claim-chest">Mở</button>}
                </div>
                {s.couple.has_partner && (
                  <div className={`flex items-center gap-2 rounded-2xl border-2 p-2 ${s.couple.claimed ? "border-green-300 bg-green-50" : "border-pink-300 bg-pink-50"}`}>
                    <span className="text-2xl">💞</span>
                    <div className="min-w-0 flex-1 text-sm font-bold leading-tight">Thưởng đôi<div className="text-[11px] font-semibold text-slate-500">Cả hai cùng mở rương hôm nay · 🪙 {s.couple.coins}{!s.couple.partner_done ? " · người ấy chưa xong" : ""}</div></div>
                    {s.couple.claimed ? <span className="text-xs font-extrabold text-green-700">✅ Đã nhận</span>
                      : <button className={btn} disabled={!s.chest.claimed || !s.couple.partner_done || !!busy} onClick={() => claim("couple", "claim_quest", { p_code: "_COUPLE" }, (d) => `💞 +${d.coins} xu`)} data-testid="claim-couple">Nhận</button>}
                  </div>
                )}
              </div>
            )}
            {msg && <p role="status" className={`mt-3 text-center text-sm font-bold ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.t}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
