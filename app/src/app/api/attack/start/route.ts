// BTL-07/08: bắt đầu trận — server dựng ảnh chụp căn cứ người ấy (kể cả bẫy), kiểm tra điều kiện, trừ lượt.
import { NextResponse } from "next/server";
import { currentPair, serviceClient } from "@/lib/attack-server";
import { beginBattle, parseArmy } from "@/lib/attack-core";

export async function POST(req: Request) {
  const pair = await currentPair();
  if (!pair) return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  // BTL-01: client gửi quân đã chọn {mã lính: số}
  const body = await req.json().catch(() => null) as { army?: unknown } | null;
  const pick = parseArmy(body?.army);
  if (!pick || !Object.keys(pick).length) return NextResponse.json({ error: "NO_ARMY" }, { status: 400 });
  const r = await beginBattle(serviceClient(), pair.me, pair.partner, pick);
  return NextResponse.json(r.body, { status: r.status });
}
