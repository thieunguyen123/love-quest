"use client";
// AUTH-01: đăng ký tài khoản (người đầu tiên là Admin, người thứ hai tự ghép đôi) — xong vào thẳng Onboarding
import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "../login/actions";

const input = "w-full rounded-xl border border-love-200 px-3 py-2 outline-none focus:ring-2 focus:ring-love-400";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signUp, undefined);
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form action={action} className="w-full max-w-sm bg-white/90 rounded-3xl shadow-xl shadow-love-200/60 p-8 space-y-5 border border-love-100">
        <div className="text-center space-y-1">
          <div className="text-5xl">💕</div>
          <h1 className="text-2xl font-extrabold text-love-700">Tạo tài khoản</h1>
          <p className="text-sm text-love-600/80">Love Quest dành cho đúng 2 người — bạn và người thương</p>
        </div>
        <label className="block space-y-1"><span className="text-sm font-bold">Email</span>
          <input name="email" type="email" required autoComplete="email" className={input} /></label>
        <label className="block space-y-1"><span className="text-sm font-bold">Mật khẩu (từ 8 ký tự)</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} /></label>
        <label className="block space-y-1"><span className="text-sm font-bold">Nhập lại mật khẩu</span>
          <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={input} /></label>
        {state?.error && <p role="alert" className="text-sm text-red-600 font-semibold">{state.error}</p>}
        {state?.info && <p role="status" className="text-sm text-green-700 font-semibold">{state.info}</p>}
        <button disabled={pending} className="w-full rounded-xl bg-love-500 hover:bg-love-600 text-white font-bold py-2.5 disabled:opacity-60 transition">
          {pending ? "Đang tạo…" : "Đăng ký & vào game"}
        </button>
        <p className="text-center text-xs text-love-700/70">Đăng nhập 1 lần là máy sẽ nhớ — lần sau mở app vào thẳng game.</p>
        <p className="text-center text-sm text-love-700/80">Đã có tài khoản? <Link href="/login" className="font-bold text-love-600 underline">Đăng nhập</Link></p>
      </form>
    </main>
  );
}
