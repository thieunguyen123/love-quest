"use client";
import { useEffect, useState } from "react";
import { formatLeft } from "@/lib/time";
export { formatLeft };

export function Countdown({ deadline, className = "" }: { deadline: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (now === null) return <span className={className}>--:--:--</span>;
  return <span className={className} suppressHydrationWarning>{formatLeft(Date.parse(deadline) - now)}</span>;
}
