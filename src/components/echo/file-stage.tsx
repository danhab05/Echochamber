"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileAudio, Upload, X } from "lucide-react";
import { EchoAudioEngine } from "@/lib/audio-engine";
import { EchoParams, clamp } from "@/lib/echo";
import { cn } from "@/lib/utils";
import { Tile, gridColumns } from "./tile";
import { Transport } from "./transport";
import { Visualizer } from "./visualizer";
import { usePlayPauseShortcut } from "./use-shortcut";

interface LoadedFile {
  url: string;
  name: string;
}

const MAX_FRAMES = 180; // video frames kept in memory for the delayed copies
const FRAME_WIDTH = 384;
const TILE_WIDTH = 640;

export function FileStage({ params, active }: { params: EchoParams; active: boolean }) {
  // The sound comes from an <audio> element: mobile browsers keep audio running
  // in the background (screen locked, other app) but pause <video>. The video,
  // muted, only follows the audio for the picture.
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tilesRef = useRef<(HTMLCanvasElement | null)[]>([]);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [engine, setEngine] = useState<EchoAudioEngine | null>(null);
  const [file, setFile] = useState<LoadedFile | null>(null);
  // "probe" until the metadata tells whether the file has a picture
  const [picture, setPicture] = useState<"probe" | "yes" | "no">("probe");
  const isVideo = picture === "yes";
  const [aspect, setAspect] = useState(16 / 9);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // push every parameter change to the audio graph
  useEffect(() => {
    engine?.apply(params);
  }, [engine, params]);

  // pause when the user switches to the YouTube tab
  useEffect(() => {
    if (!active) audioRef.current?.pause();
  }, [active]);

  // release the object URL when the file changes
  useEffect(() => () => {
    if (file) URL.revokeObjectURL(file.url);
  }, [file]);

  const open = useCallback(
    (f: File | undefined | null) => {
      if (!f) return;
      if (!/^(audio|video)\//.test(f.type) && !/\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm|mp4|mov|mkv)$/i.test(f.name)) {
        setError("Ce fichier n'est ni un audio ni une vidéo.");
        return;
      }
      const el = audioRef.current;
      if (!el) return;
      setError(null);
      let e = engine;
      if (!e) {
        e = new EchoAudioEngine(el);
        e.apply(paramsRef.current, true);
        setEngine(e);
      }
      void e.resume();
      el.pause();
      setPlaying(false);
      setTime(0);
      setDuration(0);
      setPicture("probe");
      setFile({ url: URL.createObjectURL(f), name: f.name });
    },
    [engine],
  );

  const play = useCallback(async () => {
    const el = audioRef.current;
    if (!el || !file) return;
    await engine?.resume();
    try {
      await el.play();
    } catch {
      setError("Lecture impossible : format non supporté par ce navigateur.");
    }
  }, [engine, file]);

  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    const target = clamp(t, 0, a.duration || 0);
    a.currentTime = target;
    if (videoRef.current) videoRef.current.currentTime = target;
    setTime(target);
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !file) return;
    if (el.paused) void play();
    else el.pause();
  }, [file, play]);

  usePlayPauseShortcut(toggle, active);

  // Lock-screen / notification controls.
  useEffect(() => {
    if (!file || !active || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({ title: file.name.replace(/\.[^.]+$/, ""), artist: "EchoChamber" });
    } catch {}
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void play()],
      ["pause", () => audioRef.current?.pause()],
      ["seekto", (d) => d.seekTime != null && seek(d.seekTime)],
      ["seekbackward", (d) => seek((audioRef.current?.currentTime ?? 0) - (d.seekOffset || 10))],
      ["seekforward", (d) => seek((audioRef.current?.currentTime ?? 0) + (d.seekOffset || 10))],
    ];
    handlers.forEach(([a, h]) => {
      try {
        ms.setActionHandler(a, h);
      } catch {}
    });
    return () => {
      handlers.forEach(([a]) => {
        try {
          ms.setActionHandler(a, null);
        } catch {}
      });
    };
  }, [file, active, play, seek]);

  const updateSession = (a: HTMLAudioElement) => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = a.paused ? "paused" : "playing";
    if (Number.isFinite(a.duration) && a.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: 1 });
      } catch {}
    }
  };

  // Coming back to the page: wake the audio graph up if the OS suspended it.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && audioRef.current && !audioRef.current.paused) void engine?.resume();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [engine]);

  // Picture: the muted video follows the audio, and the delayed copies are drawn
  // from a short history of frames indexed by media time (copy i shows the frame
  // from i × delay earlier). Only runs while the page is visible (rAF).
  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a || !isVideo || !active) return;

    const fh = Math.round(FRAME_WIDTH / aspect);
    const frames: { t: number; c: HTMLCanvasElement }[] = [];
    const pool: HTMLCanvasElement[] = [];
    let lastT = -1;
    let raf = 0;

    const take = () => {
      const c = pool.pop() ?? Object.assign(document.createElement("canvas"), { width: FRAME_WIDTH, height: fh });
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      return c;
    };
    const find = (target: number) => {
      let lo = 0;
      let hi = frames.length - 1;
      let best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].t <= target) {
          best = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return best >= 0 ? frames[best] : null;
    };

    const follow = () => {
      if (!a.paused && v.paused && !v.ended) v.play().catch(() => {});
      else if (a.paused && !v.paused) v.pause();
      if (!v.seeking && v.readyState >= 1 && Math.abs(v.currentTime - a.currentTime) > 0.2) v.currentTime = a.currentTime;
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      follow();
      if (v.readyState < 2) return;
      const p = paramsRef.current;
      const t = v.currentTime;
      if (lastT >= 0 && (t < lastT - 0.05 || t > lastT + 1)) {
        // seek (or back from the background): the history no longer matches
        pool.push(...frames.map((f) => f.c));
        frames.length = 0;
      }
      lastT = t;

      const maxDelay = ((p.voices - 1) * p.delayMs) / 1000;
      if (maxDelay >= 1 / 60) {
        const fps = clamp(MAX_FRAMES / (maxDelay + 0.3), 6, 30);
        const last = frames[frames.length - 1];
        if (!last || t - last.t >= 1 / fps - 0.002) frames.push({ t, c: take() });
        while (frames.length && (frames[0].t < t - maxDelay - 0.3 || frames.length > MAX_FRAMES)) pool.push(frames.shift()!.c);
      }

      for (let i = 1; i < p.voices; i++) {
        const tile = tilesRef.current[i];
        if (!tile) continue;
        const ctx = tile.getContext("2d")!;
        const d = (i * p.delayMs) / 1000;
        if (d < 1 / 60) {
          ctx.drawImage(v, 0, 0, tile.width, tile.height);
          continue;
        }
        const f = find(t - d);
        if (f) ctx.drawImage(f.c, 0, 0, tile.width, tile.height);
        else {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, tile.width, tile.height);
        }
      }
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      v.pause();
    };
  }, [isVideo, aspect, active, file]);

  const media = (
    <video
      ref={videoRef}
      src={file && picture !== "no" ? file.url : undefined}
      muted
      playsInline
      preload="auto"
      className={cn("h-full w-full object-contain", !isVideo && "hidden")}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        const hasPicture = v.videoWidth > 0 && v.videoHeight > 0;
        setPicture(hasPicture ? "yes" : "no");
        if (hasPicture) setAspect(v.videoWidth / v.videoHeight);
      }}
      onError={() => setPicture("no")}
      onClick={toggle}
    />
  );

  return (
    <div
      className="flex flex-col gap-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        open(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          open(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <audio
        ref={audioRef}
        src={file?.url}
        preload="auto"
        className="hidden"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => {
          setTime(e.currentTarget.currentTime);
          updateSession(e.currentTarget);
        }}
        onPlay={(e) => {
          setPlaying(true);
          updateSession(e.currentTarget);
        }}
        onPause={(e) => {
          setPlaying(false);
          updateSession(e.currentTarget);
        }}
        onEnded={() => setPlaying(false)}
        onError={() => file && setError("Impossible de lire ce fichier dans ce navigateur.")}
      />

      {file && (
        <div className="flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-3">
          <FileAudio className="h-5 w-5 shrink-0 text-accent" />
          <span className="flex-1 truncate text-[15px]">{file.name}</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Upload className="h-4 w-4" /> Changer
          </button>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-destructive/15 px-3 py-2 text-sm text-red-200">
          <X className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {!file && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors",
            dragging ? "border-primary bg-primary/10" : "border-white/15 hover:border-white/30 hover:bg-white/[0.03]",
          )}
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary/25 to-accent/25">
            <Upload className="h-6 w-6 text-primary" />
          </span>
          <span className="font-headline text-lg font-semibold">Dépose un son ou une vidéo</span>
          <span className="max-w-sm px-4 text-sm text-muted-foreground">
            MP3, WAV, FLAC, M4A, MP4, WebM… Le fichier reste sur ton appareil. Ici le décalage est exact, jusqu&apos;à 0,1 ms.
          </span>
        </button>
      )}

      {/* The <video> element must stay the same DOM node (the audio engine is bound to it),
          so it always lives in tile 0, whether the file has a picture or not. */}
      <div className={cn("grid gap-2", isVideo ? gridColumns(params.voices) : "grid-cols-1", !file && "hidden", dragging && "opacity-60")}>
        <Tile key="original" index={0} params={params} bare={!isVideo}>
          {media}
          {!isVideo && <Visualizer engine={engine} params={params} />}
        </Tile>
        {isVideo &&
          Array.from({ length: params.voices - 1 }, (_, k) => k + 1).map((i) => (
            <Tile key={i} index={i} params={params}>
              <canvas
                ref={(el) => {
                  tilesRef.current[i] = el;
                }}
                width={TILE_WIDTH}
                height={Math.round(TILE_WIDTH / aspect)}
                className="h-full w-full object-contain"
              />
            </Tile>
          ))}
      </div>

      <Transport
        playing={playing}
        time={time}
        duration={duration}
        disabled={!file}
        onToggle={toggle}
        onSeek={seek}
      />
    </div>
  );
}
