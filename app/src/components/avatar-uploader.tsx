"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, btnGhost } from "./ui";

const MAX_BYTES = 2 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Crop vuông chính giữa + resize 256x256 webp (PRO-04)
async function toSquareWebp(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/webp", 0.9));
}

export function AvatarUploader({ userId, url, name, color, onChange }: {
  userId: string; url: string | null; name: string; color: string; onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setError(null);
    if (!OK_TYPES.includes(file.type)) return setError("Chỉ nhận ảnh jpg, png hoặc webp");
    if (file.size > MAX_BYTES) return setError("Ảnh quá lớn (tối đa 2MB)");
    setBusy(true);
    try {
      const blob = await toSquareWebp(file);
      const supabase = createClient();
      const path = `${userId}.webp`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/webp" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      onChange(`${data.publicUrl}?v=${Date.now()}`); // tránh cache ảnh cũ
    } catch {
      setError("Không tải được ảnh, thử lại nhé");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await createClient().storage.from("avatars").remove([`${userId}.webp`]);
    setBusy(false);
    onChange(null);
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar url={url} name={name} color={color} size={80} />
      <div className="space-y-2">
        <input ref={input} type="file" accept={OK_TYPES.join(",")} hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={btnGhost}>
            {busy ? "Đang tải…" : "Chọn ảnh"}
          </button>
          {url && <button type="button" disabled={busy} onClick={remove} className={btnGhost}>Xóa ảnh</button>}
        </div>
        {error && <p role="alert" className="text-sm text-red-600 font-semibold">{error}</p>}
        <p className="text-xs text-love-700/70">jpg / png / webp, tối đa 2MB, tự cắt vuông</p>
      </div>
    </div>
  );
}
