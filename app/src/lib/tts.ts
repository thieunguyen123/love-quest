// Phát âm bằng Web Speech API (en-US). Tốc độ lấy từ cài đặt (localStorage).
export function defaultRate(): number {
  try { return Number(localStorage.getItem("tts_rate") ?? "1") || 1; } catch { return 1; }
}
export function speak(text: string, rate = 1) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = rate;
  const v = window.speechSynthesis.getVoices().find((x) => x.lang.startsWith("en-US"));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}
