"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AvatarUploader } from "@/components/avatar-uploader";
import { Card, btnPrimary, inputCls } from "@/components/ui";
import type { Profile } from "@/lib/session";

export default function EditForm({ me }: { me: Profile }) {
  const router = useRouter();
  const [name, setName] = useState(me.display_name);
  const [bio, setBio] = useState(me.bio);
  const [birthday, setBirthday] = useState(me.birthday ?? "");
  const [color, setColor] = useState(me.favorite_color);
  const [avatar, setAvatar] = useState(me.avatar_url);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const errors = {
    name: name.trim().length < 2 || name.trim().length > 20 ? "Tên phải từ 2 đến 20 ký tự" : null,
    bio: bio.length > 150 ? "Giới thiệu tối đa 150 ký tự" : null,
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (errors.name || errors.bio) return;
    setBusy(true); setMsg(null);
    const { error } = await createClient().from("profiles")
      .update({ display_name: name.trim(), bio, birthday: birthday || null, favorite_color: color, avatar_url: avatar })
      .eq("id", me.id);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Không lưu được, thử lại nhé" });
    setMsg({ ok: true, text: "Đã lưu ✅" });
    router.refresh();
  }

  return (
    <Card className="max-w-lg mx-auto">
      <form onSubmit={save} className="space-y-4">
        <h1 className="text-xl font-extrabold text-love-700">Sửa hồ sơ</h1>
        <AvatarUploader userId={me.id} url={avatar} name={name} color={color} onChange={setAvatar} />
        <label className="block space-y-1"><span className="text-sm font-bold">Tên hiển thị</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} className={inputCls} />
          {errors.name && <span className="text-sm text-red-600 font-semibold">{errors.name}</span>}
        </label>
        <label className="block space-y-1"><span className="text-sm font-bold">Giới thiệu ({bio.length}/150)</span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={inputCls} />
          {errors.bio && <span className="text-sm text-red-600 font-semibold">{errors.bio}</span>}
        </label>
        <label className="block space-y-1"><span className="text-sm font-bold">Ngày sinh</span>
          <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className={inputCls} />
        </label>
        <label className="flex items-center gap-3"><span className="text-sm font-bold">Màu yêu thích</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 rounded cursor-pointer" />
        </label>
        {msg && <p role="status" className={`text-sm font-semibold ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
        <button disabled={busy || !!errors.name || !!errors.bio} className={`${btnPrimary} w-full`}>{busy ? "Đang lưu…" : "Lưu"}</button>
      </form>
    </Card>
  );
}
