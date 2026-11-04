"use client";

import { useState } from "react";
import { Pause, Play, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/echo";
import { cn } from "@/lib/utils";

interface TransportProps {
  playing: boolean;
  time: number;
  duration: number;
  disabled?: boolean;
  loading?: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
}

export function Transport({ playing, time, duration, disabled, loading, onToggle, onSeek }: TransportProps) {
  // While dragging, show the thumb where the user is, not where the player is.
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub ?? time;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-card/70 p-3 pr-5 backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label={playing ? "Pause" : "Lecture"}
        className={cn(
          "grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-background transition-all",
          "shadow-[0_0_24px_hsl(var(--primary)/0.45)] hover:scale-105 active:scale-95",
          "disabled:cursor-not-allowed disabled:from-white/10 disabled:to-white/10 disabled:text-muted-foreground disabled:shadow-none",
        )}
      >
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : playing ? (
          <Pause className="h-6 w-6" fill="currentColor" />
        ) : (
          <Play className="ml-0.5 h-6 w-6" fill="currentColor" />
        )}
      </button>
      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{formatTime(shown)}</span>
      <Slider
        min={0}
        max={Math.max(duration, 0.01)}
        step={0.1}
        value={[Math.min(shown, duration || 0)]}
        disabled={disabled || !duration}
        onValueChange={([v]) => setScrub(v)}
        onValueCommit={([v]) => {
          setScrub(null);
          onSeek(v);
        }}
        aria-label="Position"
      />
      <span className="w-12 text-xs tabular-nums text-muted-foreground">{formatTime(duration)}</span>
    </div>
  );
}
