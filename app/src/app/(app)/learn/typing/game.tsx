"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { speak, defaultRate } from "@/lib/tts";
import { play } from "@/lib/sfx";
import { difficulty, matchesAny, pendingCoins, pickWord, type TypingCfg } from "@/lib/game/typing";
import { Card, btnGhost, btnPrimary, inputCls } from "@/components/ui";

type W = { id: string; levelId: string; en: string; vi: string[]; wrong: number };
type Falling = { key: number; w: W; x: number; born: number; fallMs: number; exploded?: number };
type Result = { coins_earned: number; capped: boolean; today_total: number; daily_cap: number; record: number };

export default function TypingGame({ cfg, levels, words, usedToday, myRecord, partnerRecord, partnerName }: {
  cfg: TypingCfg; levels: { id: string; order_no: number; topic_vi: string }[]; words: W[];
  usedToday: number; myRecord: number; partnerRecord: number | null; partnerName: string;
}) {
  const [source, setSource] = useState<string>("all");
  const [phase, setPhase] = useState<"pick" | "play" | "over">("pick");
  const [lives, setLives] = useState(cfg.lives);
  const [hits, setHits] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [missedShow, setMissedShow] = useState<W | null>(null);
  const [lostList, setLostList] = useState<W[]>([]);
  const [shake, setShake] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [speedUp, setSpeedUp] = useState(0);   // cấp tốc độ vừa tăng → hiện "⚡ Nhanh hơn!"
  // điện thoại: khung chơi bám đúng phần màn hình còn thấy phía trên bàn phím (visualViewport) → ô nhập sát bàn phím, không khoảng trắng
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);

  // trạng thái game trong ref để vòng lặp animation không bị re-render
  const g = useRef({ items: [] as Falling[], key: 0, hits: 0, lives: cfg.lives, lastSpawn: 0, start: 0, hitIds: [] as string[], missIds: [] as string[], lost: [] as W[], over: false, step: 0, pool: [] as W[], parts: [] as { x: number; y: number; vx: number; vy: number; t: number }[] });

  const pool = words.filter((w) => source === "all" || w.levelId === source);

  function begin() {
    if (pool.length < 4) { setErr("Cần ít nhất 4 từ trong nguồn đã chọn"); return; }
    setErr(null);
    Object.assign(g.current, { items: [], hits: 0, lives: cfg.lives, lastSpawn: 0, start: performance.now(), hitIds: [], missIds: [], lost: [], over: false, step: 0, pool, parts: [] });
    setLives(cfg.lives); setHits(0); setLostList([]); setResult(null); setText("");
    setPhase("play");
    setTimeout(() => input.current?.focus(), 50);
  }

  const finish = useCallback(async () => {
    const s = g.current;
    s.over = true;
    setPhase("over"); setSaving(true);
    const { data, error } = await createClient().rpc("claim_typing_session", {
      p_source: source === "all" ? null : source, p_hit: s.hits, p_missed: s.missIds.length,
      p_duration_ms: Math.round(performance.now() - s.start), p_hit_ids: s.hitIds, p_missed_ids: s.missIds,
    });
    setSaving(false);
    if (error) setErr("Không lưu được kết quả ván này"); else setResult(data as Result);
    setLostList([...s.lost]);
    play(s.lives <= 0 ? "lose" : "coin");
  }, [source]);

  useEffect(() => {
    if (phase !== "play") return;
    const v = window.visualViewport;
    if (!v || !window.matchMedia("(max-width: 767px)").matches) return;
    const up = () => setVv({ h: Math.round(v.height), top: Math.round(v.offsetTop) });
    up(); v.addEventListener("resize", up); v.addEventListener("scroll", up);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { v.removeEventListener("resize", up); v.removeEventListener("scroll", up); document.body.style.overflow = prev; setVv(null); };
  }, [phase]);

  // vòng lặp vẽ + logic rơi
  useEffect(() => {
    if (phase !== "play") return;
    const cv = canvas.current!; const ctx = cv.getContext("2d")!;
    let raf = 0;
    const resize = () => { cv.width = cv.clientWidth * devicePixelRatio; cv.height = cv.clientHeight * devicePixelRatio; };
    resize(); window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize); ro.observe(cv);   // khung đổi cỡ khi bàn phím điện thoại mở / đóng

    const frame = (now: number) => {
      const s = g.current;
      const W = cv.width, H = cv.height, dpr = devicePixelRatio;
      const diff = difficulty(s.hits, cfg);
      // sinh từ mới
      const alive = s.items.filter((i) => !i.exploded);
      if (diff.step > s.step) { s.step = diff.step; setSpeedUp(diff.step); setTimeout(() => setSpeedUp(0), 1600); }
      if (!s.over && alive.length < diff.maxOnScreen && (s.lastSpawn === 0 || now - s.lastSpawn > diff.spawnGapSec * 1000)) {
        const w = pickWord(s.pool, new Set(alive.map((i) => i.w.id)));
        if (w) { s.items.push({ key: s.key++, w, x: 0.12 + Math.random() * 0.76, born: now, fallMs: diff.fallSec * 1000 }); s.lastSpawn = now; }
      }
      ctx.clearRect(0, 0, W, H);
      const grad = ctx.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, "#fff1f6"); grad.addColorStop(1, "#ffd6e7");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(214,49,127,.25)"; ctx.fillRect(0, H - 6 * dpr, W, 6 * dpr); // đáy

      for (const it of s.items) {
        if (it.exploded) continue;
        const p = (now - it.born) / it.fallMs;
        if (p >= 1) { // chạm đáy
          it.exploded = now;
          s.lives -= 1; s.lost.push(it.w); s.missIds.push(it.w.id);
          setLives(s.lives); setMissedShow(it.w); setTimeout(() => setMissedShow(null), 1000); play("wrong");
          if (s.lives <= 0 && !s.over) void finish();
          continue;
        }
        const x = it.x * W, y = p * (H - 40 * dpr) + 20 * dpr;
        ctx.font = `800 ${22 * dpr}px Nunito, sans-serif`;
        const tw = ctx.measureText(it.w.en).width;
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#ec4899"; ctx.lineWidth = 2 * dpr;
        const bx = Math.min(Math.max(x - tw / 2 - 12 * dpr, 4 * dpr), W - tw - 28 * dpr);
        ctx.beginPath(); ctx.roundRect(bx, y - 22 * dpr, tw + 24 * dpr, 36 * dpr, 18 * dpr); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ad1457"; ctx.fillText(it.w.en, bx + 12 * dpr, y + 3 * dpr);
      }
      // hạt nổ
      s.parts = s.parts.filter((pt) => now - pt.t < 500);
      for (const pt of s.parts) { const a = 1 - (now - pt.t) / 500; ctx.fillStyle = `rgba(236,72,153,${a})`; ctx.beginPath(); ctx.arc(pt.x + pt.vx * (now - pt.t) / 16, pt.y + pt.vy * (now - pt.t) / 16, 4 * dpr * a, 0, 7); ctx.fill(); }
      s.items = s.items.filter((i) => !i.exploded || now - i.exploded < 100);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); ro.disconnect(); };
  }, [phase, cfg, finish]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = g.current;
    if (s.over) return;
    const cands = s.items.filter((i) => !i.exploded && matchesAny(text, i.w.vi, cfg.noDiacritics));
    setText("");
    if (!cands.length) { setShake(true); setTimeout(() => setShake(false), 250); play("wrong"); return; }
    // nếu nhiều từ khớp: nổ từ thấp nhất (born sớm nhất)
    const it = cands.reduce((a, b) => (a.born < b.born ? a : b));
    it.exploded = performance.now();
    const cv = canvas.current!; const dpr = devicePixelRatio;
    const p = (performance.now() - it.born) / it.fallMs;
    for (let k = 0; k < 14; k++) s.parts.push({ x: it.x * cv.width, y: p * (cv.height - 40 * dpr) + 20 * dpr, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, t: performance.now() });
    s.hits += 1; s.hitIds.push(it.w.id); setHits(s.hits);
    play("boom"); speak(it.w.en, defaultRate());
    if (s.hits % cfg.rewardEvery === 0) setTimeout(() => play("coin"), 150);
  }

  if (phase === "pick") {
    return (
      <Card className="max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-extrabold text-love-700">🌧️ Mưa chữ</h1>
        <p className="text-sm">Từ tiếng Anh rơi xuống — gõ <b>nghĩa tiếng Việt</b> rồi Enter để bắn nổ trước khi chạm đáy. {cfg.lives} mạng. Cứ {cfg.rewardEvery} từ trúng được +{cfg.rewardCoins} xu (tối đa {cfg.dailyCap} xu/ngày).</p>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
          <option value="all">Trộn tất cả từ đã mở ({words.length} từ)</option>
          {levels.map((l) => <option key={l.id} value={l.id}>Màn {l.order_no}: {l.topic_vi} ({words.filter((w) => w.levelId === l.id).length} từ)</option>)}
        </select>
        <div className="flex gap-4 text-sm font-semibold">
          <span>🏅 Kỷ lục của bạn: {myRecord}</span>
          {partnerRecord !== null && <span>💕 {partnerName}: {partnerRecord}</span>}
        </div>
        <div className="text-sm">Hôm nay đã nhận {usedToday}/{cfg.dailyCap} xu</div>
        {err && <p role="alert" className="text-sm text-red-600 font-semibold">{err}</p>}
        <div className="flex gap-2"><button className={btnPrimary} onClick={begin}>Bắt đầu</button><Link href="/learn" className={btnGhost}>Quay lại</Link></div>
      </Card>
    );
  }

  const pc = pendingCoins(hits, usedToday, cfg);
  if (phase === "over") {
    return (
      <Card className="max-w-lg mx-auto space-y-4 text-center">
        <div className="text-5xl">{lives <= 0 ? "💥" : "🏁"}</div>
        <h1 className="text-2xl font-extrabold text-love-700">{lives <= 0 ? "GAME OVER" : "Kết thúc ván"}</h1>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-love-50 p-3"><div className="text-2xl font-extrabold text-love-600">{hits}</div><div className="text-xs font-semibold">Từ bắn trúng</div></div>
          <div className="rounded-xl bg-love-50 p-3"><div className="text-2xl font-extrabold text-love-600">{saving ? "…" : `+${result?.coins_earned ?? 0}`}</div><div className="text-xs font-semibold">Xu nhận</div></div>
          <div className="rounded-xl bg-love-50 p-3"><div className="text-2xl font-extrabold text-love-600">{result?.record ?? myRecord}</div><div className="text-xs font-semibold">Kỷ lục</div></div>
        </div>
        {result?.capped && <p className="text-sm font-semibold text-amber-700">Đã đạt trần xu hôm nay ({result.today_total}/{result.daily_cap}) — vẫn chơi được nhưng không nhận thêm xu.</p>}
        {err && <p role="alert" className="text-sm text-red-600 font-semibold">{err}</p>}
        {lostList.length > 0 && (
          <div className="text-left space-y-1">
            <div className="font-bold text-sm">Từ bị lọt:</div>
            <ul className="text-sm grid grid-cols-2 gap-x-4">{lostList.map((w, i) => <li key={i}><b>{w.en}</b> — {w.vi[0]}</li>)}</ul>
          </div>
        )}
        <div className="flex gap-2 justify-center"><button className={btnPrimary} onClick={() => setPhase("pick")}>Chơi lại</button><Link href="/learn" className={btnGhost}>Thư viện</Link></div>
      </Card>
    );
  }

  return (
    <div className={vv ? "fixed inset-x-0 z-40 flex flex-col gap-2 bg-[#fff7fb] px-3 py-2" : "max-w-2xl mx-auto space-y-3"}
      style={vv ? { top: vv.top, height: vv.h } : undefined} data-testid="typing-play">
      <div className="flex items-center justify-between font-bold">
        <span aria-label={`${lives} mạng`}>{"❤️".repeat(Math.max(0, lives))}{"🖤".repeat(Math.max(0, cfg.lives - lives))}</span>
        <span>Từ: {hits}</span>
        <span className="text-amber-700">🪙 +{pc.grant}{pc.capped ? " (trần)" : ""}</span>
        <button className="text-sm underline text-love-700" onClick={finish}>Kết thúc</button>
      </div>
      <div className={vv ? "relative min-h-0 flex-1" : "relative"}>
        <canvas ref={canvas} className={`block w-full rounded-2xl border border-love-200 ${vv ? "h-full" : "h-[55vh]"}`} />
        {speedUp > 0 && <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit animate-bounce rounded-full bg-amber-400 px-4 py-1 text-sm font-extrabold text-white shadow" data-testid="speed-up">⚡ Nhanh hơn! (cấp {speedUp + 1})</div>}
        {missedShow && <div className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-xl bg-white/95 px-4 py-2 font-bold text-red-600 shadow">{missedShow.en} = {missedShow.vi.join(", ")}</div>}
      </div>
      <form onSubmit={submit}>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} autoFocus autoComplete="off" autoCapitalize="off"
          placeholder="Gõ nghĩa tiếng Việt rồi Enter…" aria-label="Nghĩa tiếng Việt"
          className={`${inputCls} text-lg font-bold ${shake ? "shake border-red-500" : ""}`} onBlur={() => setTimeout(() => input.current?.focus(), 0)} />
      </form>
    </div>
  );
}
