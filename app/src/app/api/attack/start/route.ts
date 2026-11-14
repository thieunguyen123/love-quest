// BTL-07/08: bắt đầu trận — server dựng ảnh chụp căn cứ người ấy (kể cả bẫy), kiểm tra điều kiện, trừ lượt.
import { NextResponse } from "next/server";
import { currentPair, serviceClient } from "@/lib/attack-server";
import { beginBattle } from "@/lib/attack-core";

export async function POST() {
  const pair = await currentPair();
  if (!pair) return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  const r = await beginBattle(serviceClient(), pair.me, pair.partner);
  return NextResponse.json(r.body, { status: r.status });
}
