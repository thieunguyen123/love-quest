// BTL-08: kết thúc trận — client chỉ gửi NHẬT KÝ rải quân; server chạy lại mô phỏng rồi ghi kết quả.
import { NextResponse } from "next/server";
import { currentPair, serviceClient } from "@/lib/attack-server";
import { finishBattle } from "@/lib/attack-core";

export async function POST(req: Request) {
  const pair = await currentPair();
  if (!pair) return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  const r = await finishBattle(serviceClient(), pair.me, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
