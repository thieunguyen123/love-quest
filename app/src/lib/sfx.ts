// Âm thanh tổng hợp bằng WebAudio (không cần file). Bật/tắt riêng nhạc & hiệu ứng, lưu localStorage (SYS-04).
type Kind = "correct" | "wrong" | "boom" | "win" | "lose" | "coin" | "click";
let ctx: AudioContext | null = null;

export function sfxEnabled(): boolean { try { return localStorage.getItem("sfx") !== "off"; } catch { return true; } }
export function setSfx(on: boolean) { try { localStorage.setItem("sfx", on ? "on" : "off"); } catch { /* ignore */ } }
export function musicEnabled(): boolean { try { return localStorage.getItem("music") === "on"; } catch { return false; } }
export function setMusic(on: boolean) { try { localStorage.setItem("music", on ? "on" : "off"); } catch { /* ignore */ } if (!on) stopMusic(); }

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
}

export function play(kind: Kind) {
  if (typeof window === "undefined" || !sfxEnabled()) return;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    switch (kind) {
      case "correct": tone(660, 0, 0.12); tone(880, 0.1, 0.18); break;
      case "wrong": tone(200, 0, 0.25, "sawtooth", 0.1); break;
      case "boom": tone(120, 0, 0.2, "square", 0.12); tone(60, 0.05, 0.25, "sawtooth", 0.1); break;
      case "coin": tone(988, 0, 0.08, "square", 0.08); tone(1319, 0.08, 0.2, "square", 0.08); break;
      case "click": tone(500, 0, 0.05, "triangle", 0.08); break;
      case "win": [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25)); break;
      case "lose": [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.18, 0.3, "triangle")); break;
    }
  } catch { /* trình duyệt chặn audio: bỏ qua */ }
}

let musicTimer: ReturnType<typeof setInterval> | null = null;
export function startMusic() {
  if (typeof window === "undefined" || !musicEnabled() || musicTimer) return;
  const notes = [523, 659, 784, 659, 587, 698, 880, 698];
  let i = 0;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void ctx.resume();
    musicTimer = setInterval(() => tone(notes[i++ % notes.length], 0, 0.5, "sine", 0.035), 600);
  } catch { /* ignore */ }
}
export function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
