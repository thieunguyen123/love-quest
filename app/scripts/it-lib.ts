// Tiện ích dùng chung cho test tích hợp (DB local đã seed)
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import path from "node:path";
config({ path: path.resolve(__dirname, "..", process.env.IT_ENV ?? ".env.local"), quiet: true });
export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let fails = 0;
export const ok = (c: boolean, name: string, extra?: unknown) => { console.log(`${c ? "PASS" : "FAIL"}  ${name}`, c ? "" : JSON.stringify(extra) ?? ""); if (!c) fails++; };
export const done = () => { console.log(fails ? `\n${fails} FAIL` : "\nTất cả PASS"); process.exit(fails ? 1 : 0); };
export async function as(email: string, password: string): Promise<{ c: SupabaseClient; id: string }> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error; return { c, id: data.user!.id };
}
export const moheoLogin = () => as("moheo@lovequest.local", "moheo-dev-2026");
export const utdacLogin = () => as("utdac@lovequest.local", "utdac-dev-2026");
export async function ensureOnboarded(u: { c: SupabaseClient }, name: string) {
  await u.c.rpc("complete_onboarding", { p_name: name, p_color: "#ec4899" });
}
export const levelId = async (n: number) => (await admin.from("levels").select("id").eq("order_no", n).single()).data!.id as string;
export const coins = async (id: string) => (await admin.from("profiles").select("coins").eq("id", id).single()).data!.coins as number;
// Reset trạng thái game bằng hàm SQL dev_reset_game() (chỉ service_role gọi được)
export async function resetGame() {
  const { error } = await admin.rpc("dev_reset_game");
  if (error) throw error;
}
