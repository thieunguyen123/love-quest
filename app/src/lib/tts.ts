// Phát âm tiếng Anh. Tốc độ lấy từ cài đặt (localStorage).
// 1) Web Speech API (giọng en-US của máy). Chrome Android có vài lỗi đã biết, xử lý ở đây:
//    - speak() ngay sau cancel() bị bỏ qua lặng lẽ → chỉ cancel khi đang đọc, rồi đợi 1 nhịp mới speak
//    - tên ngôn ngữ dạng "en_US" (gạch dưới) → chuẩn hoá trước khi chọn giọng
//    - utterance bị thu gom rác trước khi đọc xong → giữ tham chiếu
//    - hàng đợi bị "paused" → resume()
// 2) Máy không có giọng tiếng Anh / đọc lỗi / im lặng quá 1.5 s → phát file âm thanh từ điển (dictionaryapi.dev, chỉ gửi từ vựng).
export function defaultRate(): number {
  try { return Number(localStorage.getItem("tts_rate") ?? "1") || 1; } catch { return 1; }
}

let voices: SpeechSynthesisVoice[] = [];
let current: SpeechSynthesisUtterance | null = null;   // giữ tham chiếu (Chrome Android)
let audio: HTMLAudioElement | null = null;
const audioCache = new Map<string, string | null>();

const norm = (l: string) => l.replace("_", "-").toLowerCase();
function loadVoices() { try { voices = window.speechSynthesis.getVoices(); } catch { voices = []; } }
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}
function pickVoice(): SpeechSynthesisVoice | undefined {
  if (!voices.length) loadVoices();
  const en = voices.filter((v) => norm(v.lang).startsWith("en"));
  return en.find((v) => norm(v.lang) === "en-us" && v.localService) ?? en.find((v) => norm(v.lang) === "en-us")
    ?? en.find((v) => norm(v.lang) === "en-gb") ?? en[0];
}

/** Phát file âm thanh phát âm từ điển (dự phòng khi máy không đọc được) */
async function playDictionary(text: string, rate: number) {
  const word = text.trim().toLowerCase();
  if (!/^[a-z][a-z' -]{0,40}$/.test(word)) return;
  let url = audioCache.get(word);
  if (url === undefined) {
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const d = r.ok ? await r.json() : [];
      const all: string[] = (d as { phonetics?: { audio?: string }[] }[]).flatMap((e) => (e.phonetics ?? []).map((p) => p.audio ?? "")).filter(Boolean);
      url = all.find((a) => /-us\.mp3$/.test(a)) ?? all[0] ?? null;
    } catch { url = null; }
    audioCache.set(word, url);
  }
  if (!url) return;
  audio?.pause();
  audio = new Audio(url); audio.playbackRate = rate;
  void audio.play().catch(() => undefined);
}

export function speak(text: string, rate = 1) {
  if (typeof window === "undefined" || !text) return;
  const ss = "speechSynthesis" in window ? window.speechSynthesis : null;
  const voice = ss ? pickVoice() : undefined;
  if (!ss || (voices.length > 0 && !voice)) { void playDictionary(text, rate); return; }   // không có giọng tiếng Anh

  let started = false, failed = false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang.replace("_", "-") ?? "en-US"; u.rate = rate;
  if (voice) u.voice = voice;
  u.onstart = () => { started = true; };
  u.onend = () => { if (current === u) current = null; };
  u.onerror = (e) => { if (e.error !== "interrupted" && e.error !== "canceled" && !failed) { failed = true; void playDictionary(text, rate); } };
  current = u;

  const busy = ss.speaking || ss.pending;
  if (busy) ss.cancel();
  const go = () => { try { ss.resume(); ss.speak(u); } catch { failed = true; void playDictionary(text, rate); } };
  if (busy) setTimeout(go, 80); else go();
  // một số máy Android im lặng không báo lỗi → dự phòng
  setTimeout(() => { if (!started && !failed && current === u && !ss.speaking) { failed = true; ss.cancel(); void playDictionary(text, rate); } }, 1500);
}
