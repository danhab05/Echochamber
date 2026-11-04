"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileAudio, Youtube } from "lucide-react";
import { Controls } from "@/components/echo/controls";
import { FileStage } from "@/components/echo/file-stage";
import { YouTubeStage } from "@/components/echo/youtube-stage";
import { DEFAULT_PARAMS, DELAY_RANGE, EchoParams, MAX_VOICES, SourceMode, clamp } from "@/lib/echo";
import { cn } from "@/lib/utils";

const PARAMS_KEY = "echochamber:params";
const MODE_KEY = "echochamber:mode";

export default function Home() {
  const [mode, setMode] = useState<SourceMode>("youtube");
  const [params, setParams] = useState<EchoParams>(DEFAULT_PARAMS);

  // restore settings (after mount, so server and client render the same thing)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PARAMS_KEY) || "null");
      if (saved && typeof saved === "object") setParams((p) => sanitize({ ...p, ...saved }));
      const m = localStorage.getItem(MODE_KEY);
      if (m === "youtube" || m === "file") setMode(m);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
      localStorage.setItem(MODE_KEY, mode);
    } catch {}
  }, [params, mode]);

  const update = useCallback((patch: Partial<EchoParams>) => setParams((p) => sanitize({ ...p, ...patch })), []);

  // YouTube can't go as low as a local file: clamp without losing the user's value.
  const effective = useMemo(() => {
    const { min, max } = DELAY_RANGE[mode];
    return { ...params, delayMs: clamp(params.delayMs, min, max) };
  }, [params, mode]);

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <Backdrop />

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="font-headline text-3xl font-bold tracking-tight sm:text-4xl">
                Echo<span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Chamber</span>
              </h1>
              <p className="text-sm text-muted-foreground">La même vidéo, jouée plusieurs fois avec un léger décalage.</p>
            </div>
          </div>

          <div role="tablist" aria-label="Source" className="flex rounded-xl border border-white/10 bg-card/70 p-1 backdrop-blur">
            <ModeTab active={mode === "youtube"} onClick={() => setMode("youtube")} icon={<Youtube />} label="YouTube" />
            <ModeTab active={mode === "file"} onClick={() => setMode("file")} icon={<FileAudio />} label="Fichier local" />
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0">
            {mode === "youtube" && <YouTubeStage params={effective} />}
            {/* kept mounted so the loaded file survives a trip to the YouTube tab */}
            <div className={cn(mode !== "file" && "hidden")}>
              <FileStage params={effective} active={mode === "file"} />
            </div>
          </section>

          <aside className="lg:sticky lg:top-6">
            <Controls mode={mode} params={effective} onChange={update} />
          </aside>
        </div>

        <footer className="grid gap-3 text-xs text-muted-foreground/80 sm:grid-cols-2">
          <p>
            <strong className="text-foreground/80">YouTube</strong> — chaque copie est un lecteur YouTube, recalé en continu sur
            l&apos;original. Idéal pour des échos à partir de ~100 ms. Sur mobile, les navigateurs ne lisent souvent qu&apos;une vidéo
            à la fois.
          </p>
          <p>
            <strong className="text-foreground/80">Fichier local</strong> — le son passe par la Web Audio API : les copies sont
            exactes à l&apos;échantillon près, du flanger (0,1 ms) au canyon (1 s), avec placement stéréo.
          </p>
        </footer>
      </div>
    </main>
  );
}

function sanitize(p: EchoParams): EchoParams {
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    voices: Math.round(clamp(num(p.voices, DEFAULT_PARAMS.voices), 1, MAX_VOICES)),
    delayMs: clamp(num(p.delayMs, DEFAULT_PARAMS.delayMs), DELAY_RANGE.file.min, DELAY_RANGE.file.max),
    persistence: clamp(num(p.persistence, DEFAULT_PARAMS.persistence), 0.1, 1),
    spread: clamp(num(p.spread, DEFAULT_PARAMS.spread), 0, 1),
    volume: clamp(num(p.volume, DEFAULT_PARAMS.volume), 0, 1),
  };
}

function ModeTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all [&_svg]:h-4 [&_svg]:w-4",
        active ? "bg-gradient-to-r from-primary/25 to-accent/25 text-foreground shadow-inner" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--accent))" />
        </linearGradient>
      </defs>
      {[20, 14, 8].map((r, i) => (
        <circle key={r} cx="24" cy="24" r={r} fill="none" stroke="url(#logo-g)" strokeWidth={2.5 - i * 0.4} opacity={0.35 + i * 0.3} />
      ))}
      <circle cx="24" cy="24" r="3.5" fill="url(#logo-g)" />
    </svg>
  );
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-primary/20 blur-[120px]" />
      <div className="absolute -bottom-48 -right-40 h-[560px] w-[560px] rounded-full bg-accent/15 blur-[130px]" />
      <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--foreground)/0.06)_1px,transparent_1px)] [background-size:22px_22px]" />
    </div>
  );
}
