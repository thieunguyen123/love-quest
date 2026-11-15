// ADM: reset mùa giải (vùng nguy hiểm, tách riêng để không bấm nhầm)
import { requireAdmin } from "@/lib/session";
import SeasonReset from "./reset";

export default async function AdminSeasonPage() {
  await requireAdmin();
  return (
    <>
      <h1 className="text-2xl font-extrabold text-red-700">⚠️ Reset mùa giải</h1>
      <SeasonReset />
    </>
  );
}
