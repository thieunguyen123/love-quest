import Link from "next/link";
export default function Forbidden() {
  return <main className="min-h-screen grid place-items-center text-center"><div><div className="text-6xl">🚫</div><h1 className="text-2xl font-extrabold text-love-700 mt-2">403 – Bạn không có quyền vào trang này</h1><Link href="/" className="underline font-bold">Về trang chủ</Link></div></main>;
}
