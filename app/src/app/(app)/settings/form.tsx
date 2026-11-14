"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { signOut } from "@/app/login/actions";
import { musicEnabled, play, setMusic, setSfx, sfxEnabled, startMusic } from "@/lib/sfx";
import { setGfx, setShowFps, useQuality, type GfxSetting } from "@/components/three/quality";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const b64 = (s: string) => Uint8Array.from(atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export default function SettingsForm() {
  const [rate, setRate] = useState("1");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sfx, setSfxS] = useState(true);
  const [music, setMusicS] = useState(false);
  const [view, setView] = useState("2d");
  const [perm, setPerm] = useState<string>("default");
  const [push, setPush] = useState<string | null>(null);
  const gfx = useQuality();

  useEffect(() => {
    try { setRate(localStorage.getItem("tts_rate") ?? "1"); setView(localStorage.getItem("view") ?? "2d"); } catch { /* ignore */ }
    setSfxS(sfxEnabled()); setMusicS(musicEnabled());
    if ("Notification" in window) setPerm(Notification.permission);
  }, []);
  function setSpeed(v: string) { setRate(v); try { localStorage.setItem("tts_rate", v); } catch { /* ignore */ } }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ ok: false, text: "Mật khẩu phải từ 8 ký tự" });
    const { error } = await createClient().auth.updateUser({ password: pw });
    setMsg(error ? { ok: false, text: "Không đổi được mật khẩu" } : { ok: true, text: "Đã đổi mật khẩu ✅" });
    if (!error) setPw("");
  }

  async function enableNotifications() {
    if (!("Notification" in window)) return setPush("Trình duyệt không hỗ trợ thông báo");
    const r = await Notification.requestPermission(); setPerm(r);
    if (r !== "granted") return setPush("Bạn đã không cho phép thông báo");
    if (!VAPID || !("serviceWorker" in navigator) || !("PushManager" in window)) return setPush("Đã bật thông báo khi mở app. (Push khi đóng app cần cấu hình VAPID — xem hướng dẫn trong CLAUDE.md)");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setPush(res.ok ? "Đã bật push ✅ — bạn sẽ nhận thông báo cả khi đóng app" : "Không lưu được đăng ký push");
    } catch { setPush("Không đăng ký được push trên thiết bị này"); }
  }

  const row = "flex items-center justify-between gap-3";
  const Toggle = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={`h-7 w-12 rounded-full transition ${on ? "bg-love-500" : "bg-gray-300"} relative`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-5" : "left-0.5"}`} /></button>
  );
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-extrabold text-love-700">🎮 Đồ hoạ 3D</h2>
        <label className="block space-y-1"><span className="text-sm font-bold">Mức đồ hoạ</span>
          <select value={gfx.setting} onChange={(e) => setGfx(e.target.value as GfxSetting)} className={inputCls} data-testid="gfx">
            <option value="auto">Tự động (đang dùng: {gfx.tier === "high" ? "Cao" : "Thấp"})</option><option value="high">Cao — có bóng đổ, nét hơn</option><option value="low">Thấp — mượt nhất cho điện thoại</option>
          </select></label>
        <div className={row}><span className="font-bold text-sm">Hiện FPS trong cảnh 3D</span><Toggle on={gfx.showFps} label="Hiện FPS" onClick={() => setShowFps(!gfx.showFps)} /></div>
        <p className="text-xs text-love-700/70">Game tự hạ độ phân giải khi máy chậm để giữ 60 FPS. Nếu vẫn giật, chọn mức Thấp.</p>
      </section>
      <section className="space-y-3">
        <h2 className="font-extrabold text-love-700">🔊 Âm thanh</h2>
        <div className={row}><span className="font-bold text-sm">Hiệu ứng âm thanh</span><Toggle on={sfx} label="Hiệu ứng" onClick={() => { const v = !sfx; setSfx(v); setSfxS(v); if (v) play("correct"); }} /></div>
        <div className={row}><span className="font-bold text-sm">Nhạc nền</span><Toggle on={music} label="Nhạc nền" onClick={() => { const v = !music; setMusic(v); setMusicS(v); if (v) startMusic(); }} /></div>
        <label className="block space-y-1"><span className="text-sm font-bold">Tốc độ đọc mặc định</span>
          <select value={rate} onChange={(e) => setSpeed(e.target.value)} className={inputCls}><option value="1">Bình thường (1x)</option><option value="0.7">Chậm (0.7x)</option></select>
        </label>
      </section>
      <section className="space-y-3">
        <h2 className="font-extrabold text-love-700">🖥️ Giao diện</h2>
        <label className="block space-y-1"><span className="text-sm font-bold">Trang chủ mặc định</span>
          <select value={view} onChange={(e) => { setView(e.target.value); try { localStorage.setItem("view", e.target.value); } catch { /* ignore */ } }} className={inputCls}><option value="2d">Giao diện đơn giản (2D)</option><option value="3d">Thế giới 3D</option></select>
        </label>
      </section>
      <section className="space-y-2">
        <h2 className="font-extrabold text-love-700">🔔 Thông báo</h2>
        <p className="text-sm">Trạng thái: <b>{perm === "granted" ? "Đã bật" : perm === "denied" ? "Bị chặn trong trình duyệt" : "Chưa bật"}</b>. Cài app lên màn hình chính (menu trình duyệt → “Cài đặt ứng dụng”) để dùng như app điện thoại.</p>
        <button onClick={enableNotifications} className={btnGhost}>Bật thông báo</button>
        {push && <p role="status" className="text-sm font-semibold">{push}</p>}
      </section>
      <form onSubmit={changePw} className="space-y-2">
        <h2 className="font-extrabold text-love-700">🔑 Mật khẩu</h2>
        <label className="block space-y-1"><span className="text-sm font-bold">Đổi mật khẩu (≥ 8 ký tự)</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className={inputCls} />
        </label>
        {msg && <p role="status" className={`text-sm font-semibold ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
        <button className={btnPrimary}>Đổi mật khẩu</button>
      </form>
      <form action={signOut}><button className="text-sm font-bold text-red-600 underline">Đăng xuất</button></form>
    </div>
  );
}
