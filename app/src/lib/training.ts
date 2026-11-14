// Tiện ích luyện quân (BASE-04, BASE-16) — dùng chung cho Cửa hàng, bảng 🛒 Xây thêm và nhà máy trong căn cứ 3D
export const fmtDur = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m} phút ${r} giây` : `${m} phút`;
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
};
export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
/** số chỗ quân của lính đang luyện (tính vào sức chứa — giống SQL train_units) */
export const queuedSlots = (training: { unit_code: string; qty: number }[], slotsOf: (code: string) => number) =>
  training.reduce((a, t) => a + t.qty * slotsOf(t.unit_code), 0);
