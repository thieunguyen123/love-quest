"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AvatarUploader } from "@/components/avatar-uploader";
import { Card, btnPrimary, inputCls } from "@/components/ui";

const COLORS = ["#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6"];

export default function OnboardingForm({ userId, initialName }: { userId: string; initialName: string }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const nameOk = name.trim().length >= 2 && name.trim().length <= 20;

  async function finish() {
    setBusy(true); setError(null);
    const { error } = await createClient().rpc("complete_onboarding", { p_name: name, p_color: color, p_avatar_url: avatar });
    setBusy(false);
    if (error) return setError("Không lưu được, thử lại nhé");
    setDone(true);
  }

  if (done) {
    return (
      <Card className="w-full max-w-md text-center space-y-4">
        <div className="text-6xl">🎉</div>
        <h1 className="text-2xl font-extrabold text-love-700">Chào mừng {name.trim()}!</h1>
        <p>Bạn nhận được <b className="text-love-600">500 xu</b> khởi đầu. Mua thú cưng, xây nhà và thắng người ấy nhé 💕</p>
        <button className={btnPrimary} onClick={() => window.location.replace("/")}>Vào game</button>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md space-y-5">
      <div className="flex justify-center gap-2" aria-label={`Bước ${step}/3`}>
        {[1, 2, 3].map((n) => <span key={n} className={`h-2 w-10 rounded-full ${n <= step ? "bg-love-500" : "bg-love-100"}`} />)}
      </div>
      {step === 1 && (
        <div className="space-y-3">
          <h1 className="text-xl font-extrabold text-love-700">Bạn tên gì?</h1>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Tên hiển thị (2–20 ký tự)" className={inputCls} />
          {name.length > 0 && !nameOk && <p className="text-sm text-red-600 font-semibold">Tên phải từ 2 đến 20 ký tự</p>}
          <button disabled={!nameOk} onClick={() => setStep(2)} className={`${btnPrimary} w-full`}>Tiếp tục</button>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <h1 className="text-xl font-extrabold text-love-700">Ảnh đại diện</h1>
          <AvatarUploader userId={userId} url={avatar} name={name} color={color} onChange={setAvatar} />
          <button onClick={() => setStep(3)} className={`${btnPrimary} w-full`}>{avatar ? "Tiếp tục" : "Dùng avatar mặc định"}</button>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <h1 className="text-xl font-extrabold text-love-700">Màu yêu thích</h1>
          <div className="flex flex-wrap gap-3">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Màu ${c}`} onClick={() => setColor(c)}
                className={`h-10 w-10 rounded-full border-4 ${color === c ? "border-love-700 scale-110" : "border-white"} shadow`} style={{ background: c }} />
            ))}
          </div>
          {error && <p role="alert" className="text-sm text-red-600 font-semibold">{error}</p>}
          <button disabled={busy} onClick={finish} className={`${btnPrimary} w-full`}>{busy ? "Đang lưu…" : "Hoàn tất"}</button>
        </div>
      )}
    </Card>
  );
}
