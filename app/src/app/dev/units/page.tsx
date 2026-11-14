// Trang xem thử mô hình lính (CHỈ ở dev) — dùng để chỉnh tư thế cung, kỵ binh. Production → 404.
import { notFound } from "next/navigation";
import UnitsLab from "./lab";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UnitsLab />;
}
