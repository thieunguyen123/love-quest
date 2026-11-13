"use client";
import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form action={action} className="w-full max-w-sm bg-white/90 rounded-3xl shadow-xl shadow-love-200/60 p-8 space-y-5 border border-love-100">
        <div className="text-center space-y-1">
          <div className="text-5xl">💕</div>
          <h1 className="text-2xl font-extrabold text-love-700">Love Quest</h1>
          <p className="text-sm text-love-600/80">Học tiếng Anh cùng người thương</p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-bold">Email</span>
          <input name="email" type="email" required autoComplete="email"
            className="w-full rounded-xl border border-love-200 px-3 py-2 outline-none focus:ring-2 focus:ring-love-400" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-bold">Mật khẩu</span>
          <input name="password" type="password" required autoComplete="current-password"
            className="w-full rounded-xl border border-love-200 px-3 py-2 outline-none focus:ring-2 focus:ring-love-400" />
        </label>
        {state?.error && <p role="alert" className="text-sm text-red-600 font-semibold">{state.error}</p>}
        <button disabled={pending}
          className="w-full rounded-xl bg-love-500 hover:bg-love-600 text-white font-bold py-2.5 disabled:opacity-60 transition">
          {pending ? "Đang vào…" : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}
