"use client";
// Nhạc nền (SYS-04): phát nhạc YouTube qua YouTube IFrame API, trình phát ẩn — người chơi chỉ thấy nút loa 🔊/🔇 ở thanh trên.
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

/** Trình phát ẩn (đặt 1 lần trong layout) */
export function BackgroundMusic() {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [embedded, setEmbedded] = useState(true);

  useEffect(() => {
    if (window.self !== window.top) return;   // trang mở trong overlay của làng 3D: không phát lần 2
    setEmbedded(false);
  }, []);

  useEffect(() => {
    if (embedded) return;
    let cancelled = false;
    void loadApi().then((YT) => {
      if (cancelled || !host.current || player.current) return;
      // chỉ dùng trình phát sau onReady (trước đó chưa có playVideo/pauseVideo)
      new YT.Player(host.current, {
        videoId: VIDEO_ID, width: "1", height: "1",
        playerVars: { autoplay: 0, controls: 0, loop: 1, playlist: VIDEO_ID, playsinline: 1, rel: 0 },
        events: { onReady: (e: { target: YTPlayer }) => {
          if (cancelled) return;
          player.current = e.target; e.target.setVolume(35);
          if (musicEnabled() && navigator.userActivation?.hasBeenActive) e.target.playVideo();
        } },
      });
    });
    // bắt đầu phát ở lần tương tác đầu tiên (iOS/Android yêu cầu cử chỉ người dùng)
    const go = () => { if (musicEnabled()) player.current?.playVideo(); };
    window.addEventListener("pointerdown", go, { once: true }); window.addEventListener("keydown", go, { once: true });
    // nút loa
    const h = (e: Event) => { if ((e as CustomEvent<boolean>).detail) player.current?.playVideo(); else player.current?.pauseVideo(); };
    window.addEventListener(MUSIC_EVENT, h);
    return () => { cancelled = true; window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); window.removeEventListener(MUSIC_EVENT, h); };
  }, [embedded]);

  if (embedded) return null;
  // không dùng display:none (một số trình duyệt dừng phát) — khung 1px trong suốt, không bắt chạm
  return <div aria-hidden className="pointer-events-none fixed bottom-0 left-0 h-px w-px overflow-hidden opacity-0" data-testid="music"><div ref={host} /></div>;
}

/** Nút loa bật/tắt nhạc nền (thanh trên) */
export function MusicToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(musicEnabled());
    const h = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener(MUSIC_EVENT, h);
    return () => window.removeEventListener(MUSIC_EVENT, h);
  }, []);
  return (
    <button onClick={() => setMusic(!on)} aria-label={on ? "Tắt nhạc nền" : "Bật nhạc nền"} title={on ? "Tắt nhạc nền" : "Bật nhạc nền"}
      className="grid h-9 w-9 place-items-center rounded-full bg-love-50 text-lg" data-testid="music-toggle">{on ? "🔊" : "🔇"}</button>
  );
}
