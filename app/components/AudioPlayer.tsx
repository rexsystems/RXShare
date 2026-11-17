import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

interface AudioPlayerProps {
  src: string;
  title: string;
  className?: string;
}

/**
 * Small custom audio player. The native <audio controls> UI is drawn by the browser and
 * looks different everywhere (square backdrops, mismatched colors), so this one is plain markup.
 */
export function AudioPlayer({ src, title, className }: AudioPlayerProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);

  // The server-rendered <audio> can finish loading before React hydrates, so its events are missed.
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    if (a.error) setFailed(true);
    else if (a.readyState >= 1) setDuration(a.duration);
  }, []);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setFailed(true));
    else a.pause();
  };

  const seek = (v: number) => {
    if (ref.current) ref.current.currentTime = v;
    setCurrent(v);
  };

  if (failed) {
    return (
      <p role="alert" className={cn("rounded-md border border-red-400/60 px-4 py-3 text-sm text-red-300", className)}>
        This audio file could not be played in your browser. Use Download instead.
      </p>
    );
  }

  return (
    <div role="group" aria-label={`Audio player: ${title}`} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-background px-3 py-2", className)}>
      <audio
        ref={ref} src={src} preload="metadata"
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
        onError={() => setFailed(true)}
      />
      <button
        type="button" onClick={toggle} aria-pressed={playing}
        className="inline-flex min-h-11 min-w-16 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-[var(--primary-hover)]"
      >
        {playing ? "Pause" : "Play"}
      </button>
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground" aria-hidden="true">{fmt(current)}</span>
      <input
        type="range" aria-label="Seek" min={0} max={duration || 0} step={0.1} value={Math.min(current, duration || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-valuetext={`${fmt(current)} of ${fmt(duration)}`}
        className="order-last h-6 w-full accent-[var(--primary)] sm:order-none sm:w-auto sm:min-w-0 sm:flex-1"
      />
      <span className="w-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground before:content-['/_'] sm:w-10 sm:before:content-none" aria-hidden="true">{fmt(duration)}</span>
      <button
        type="button" aria-pressed={muted}
        onClick={() => { if (ref.current) ref.current.muted = !muted; setMuted(!muted); }}
        className="ml-auto min-h-11 shrink-0 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground sm:ml-0"
      >
        {muted ? "Unmute" : "Mute"}
      </button>
    </div>
  );
}
