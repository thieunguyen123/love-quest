// Hiện ngay khi bấm chuyển trang (trong lúc server dựng trang mới) — tránh cảm giác "đơ"
export default function Loading() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="Đang tải" data-testid="page-loading">
      <div className="flex flex-col items-center gap-3">
        <div className="text-5xl animate-bounce">💕</div>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-love-100"><div className="h-full w-1/3 animate-[lqload_1s_ease-in-out_infinite] rounded-full bg-love-400" /></div>
        <p className="text-sm font-bold text-love-600">Đang tải…</p>
      </div>
    </div>
  );
}
