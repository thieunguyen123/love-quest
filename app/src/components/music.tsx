"use client";
// Nhạc nền (SYS-04): phát nhạc YouTube qua trình phát nhúng CHÍNH THỨC (YouTube IFrame API).
// Điều khoản YouTube: trình phát phải hiển thị → khung nhạc nhỏ ở góc, thu gọn được nhưng vẫn thấy.
// Trình duyệt chặn tự phát âm thanh → bắt đầu ở lần chạm / phím đầu tiên. Bật/tắt lưu ở localStorage ("music").
import { useEffect, useRef, useState } from "react";
import { MUSIC_EVENT, musicEnabled, setMusic } from "@/lib/sfx";

const VIDEO_ID = "i9rBIgU0Lps";   // Nhạc Chill Không Lời – Lofi (Gió Thu Chill) — link do người chơi chọn
type YTPlayer = { playVideo(): void; pauseVideo(): void; setVolume(v: number): void; getPlayerState(): number };
type YTNamespace = { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: { PLAYING: number; ENDED: number } };
declare global { interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void } }

function loadApi(): Promise<YTNamespace> {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT!); };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.async = true; document.head.appendChild(s);
    }
  });
}

export function BackgroundMusic() {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [on, setOn] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [big, setBig] = useState(false);
  const [embedded, setEmbedded] = useState(true);

  useEffect(() => {
    if (window.self !== window.top) return;   // trang mở trong overlay của làng 3D: không phát lần 2
    setEmbedded(false);
    setOn(musicEnabled());
  }, []);

  useEffect(() => {
    if (embedded || !on || player.current) return;
    let cancelled = false;
    void loadApi().then((YT) => {
      if (cancelled || !host.current) return;
      player.current = new YT.Player(host.current, {
        videoId: VIDEO_ID, width: "100%", height: "100%",
        playerVars: { autoplay: 0, controls: 1, loop: 1, playlist: VIDEO_ID, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => { player.current?.setVolume(35); },
          onStateChange: (e: { data: number }) => setPlaying(e.data === YT.PlayerState.PLAYING),
        },
      });
    });
    return () => { cancelled = true; };
  }, [embedded, on]);

  // bắt đầu phát ở lần tương tác đầu tiên (iOS/Android yêu cầu cử chỉ người dùng)
  useEffect(() => {
    if (embedded || !on) return;
    const go = () => { if (musicEnabled()) player.current?.playVideo(); };
    window.addEventListener("pointerdown", go, { once: true }); window.addEventListener("keydown", go, { once: true });
    return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
  }, [embedded, on]);

  // Cài đặt bật/tắt nhạc
  useEffect(() => {
    const h = (e: Event) => {
      const v = (e as CustomEvent<boolean>).detail;
      setOn(v);
      if (v) player.current?.playVideo(); else { player.current?.pauseVideo(); player.current = null; }   // tắt → khung nhạc gỡ khỏi trang
    };
    window.addEventListener(MUSIC_EVENT, h);
    return () => window.removeEventListener(MUSIC_EVENT, h);
  }, []);

  if (embedded || !on) return null;
  return (
    <div className="fixed left-2 top-[6.5rem] z-[25] md:top-16" data-testid="music">
      <div className={`overflow-hidden rounded-xl border-2 border-white bg-black shadow-lg transition-all ${big ? "h-[113px] w-[200px]" : "h-[54px] w-[96px]"}`}>
        <div ref={host} className="h-full w-full" />
      </div>
      <div className="mt-1 flex gap-1">
        <button onClick={() => (playing ? player.current?.pauseVideo() : player.current?.playVideo())} className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-love-700 shadow" aria-label={playing ? "Tạm dừng nhạc" : "Phát nhạc"}>{playing ? "❚❚" : "▶"} 🎵</button>
        <button onClick={() => setBig((b) => !b)} className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-love-700 shadow" aria-label={big ? "Thu nhỏ" : "Phóng to"}>{big ? "–" : "⤢"}</button>
        <button onClick={() => setMusic(false)} className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-love-700 shadow" aria-label="Tắt nhạc nền">✕</button>
      </div>
    </div>
  );
}
