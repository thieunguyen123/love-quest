"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_prev: { error?: string } | undefined, form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: "Email hoặc mật khẩu không đúng" };
  redirect("/");
}

// AUTH-01: người chơi tự đăng ký (game cho đúng 2 người — người thứ 3 bị DB từ chối GAME_FULL). Phiên được lưu ở cookie
// (giữ 400 ngày, tự gia hạn) nên lần sau mở app không cần đăng nhập lại.
export async function signUp(_prev: { error?: string; info?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? ""), confirm = String(form.get("confirm") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Email không hợp lệ" };
  if (password.length < 8) return { error: "Mật khẩu phải từ 8 ký tự" };
  if (password !== confirm) return { error: "Hai mật khẩu không khớp" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("database error") || m.includes("game_full")) return { error: "Love Quest đã đủ 2 người chơi 💕 — chỉ 2 bạn mới vào được." };
    if (m.includes("already registered") || m.includes("already exists")) return { error: "Email này đã có tài khoản — hãy đăng nhập" };
    if (m.includes("not allowed") || m.includes("disabled")) return { error: "Hiện chưa mở đăng ký" };
    if (m.includes("password")) return { error: "Mật khẩu quá yếu — thử dài hơn, có chữ và số" };
    return { error: "Không đăng ký được, thử lại sau" };
  }
  if (!data.session) return { info: "Đã gửi email xác nhận — mở email rồi bấm link để vào game 💌" };
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
