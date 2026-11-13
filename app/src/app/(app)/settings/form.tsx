"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { btnPrimary, inputCls } from "@/components/ui";
import { signOut } from "@/app/login/actions";

export default function SettingsForm() {
  const [rate, setRate] = useState("1");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try { setRate(localStorage.getItem("tts_rate") ?? "1"); } catch { /* ignore */ }
  }, []);
  function setSpeed(v: string) { setRate(v); try { localStorage.setItem("tts_rate", v); } catch { /* ignore */ } }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ ok: false, text: "Mật khẩu phải từ 8 ký tự" });
    const { error } = await createClient().auth.updateUser({ password: pw });
    setMsg(error ? { ok: false, text: "Không đổi được mật khẩu" } : { ok: true, text: "Đã đổi mật khẩu ✅" });
    if (!error) setPw("");
  }

  return (
    <div className="space-y-6">
      <label className="block space-y-1"><span className="text-sm font-bold">Tốc độ đọc mặc định</span>
        <select value={rate} onChange={(e) => setSpeed(e.target.value)} className={inputCls}>
          <option value="1">Bình thường (1x)</option><option value="0.7">Chậm (0.7x)</option>
        </select>
      </label>
      <form onSubmit={changePw} className="space-y-2">
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
