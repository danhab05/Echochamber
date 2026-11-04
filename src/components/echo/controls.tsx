"use client";

import { useEffect, useState } from "react";
import { AudioLines, Gauge, Layers, MoveHorizontal, Timer, Volume2, AlertTriangle } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  DELAY_RANGE,
  DELAY_SLIDER_STEPS,
  EchoParams,
  MAX_VOICES,
  PRESETS,
  SourceMode,
  YOUTUBE_PRECISE_FROM_MS,
  clamp,
  delayToSlider,
  formatDelay,
  roundDelay,
  sliderToDelay,
} from "@/lib/echo";
import { EchoTrain } from "./echo-train";

interface ControlsProps {
  mode: SourceMode;
  params: EchoParams;
  onChange: (patch: Partial<EchoParams>) => void;
}

export function Controls({ mode, params, onChange }: ControlsProps) {
  const range = DELAY_RANGE[mode];
  const presets = PRESETS.filter((p) => mode === "file" || !p.fileOnly);
  const activePreset = presets.find((p) =>
    Object.entries(p.params).every(([k, v]) => {
      if (k === "spread" && mode === "youtube") return true;
      return Math.abs((params as any)[k] - (v as number)) < 1e-6;
    }),
  );

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-card/70 p-5 backdrop-blur-xl sm:p-6">
      <div>
        <h2 className="mb-3 font-headline text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Préréglages</h2>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.params)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-left text-sm transition-all",
                activePreset?.id === p.id
                  ? "border-primary bg-primary/15 text-foreground shadow-[0_0_16px_hsl(var(--primary)/0.35)]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-foreground",
              )}
            >
              <span className="font-medium">{p.label}</span>
              <span className="ml-1.5 text-xs opacity-60">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <EchoTrain params={params} mode={mode} />

      <Row icon={<Layers />} label="Copies" value={params.voices === 1 ? "1 (sans écho)" : `${params.voices}`}>
        <Slider
          min={1}
          max={MAX_VOICES}
          step={1}
          value={[params.voices]}
          onValueChange={([v]) => onChange({ voices: v })}
          aria-label="Nombre de copies"
        />
      </Row>

      <Row
        icon={<Timer />}
        label="Décalage"
        value={<DelayInput value={params.delayMs} min={range.min} max={range.max} onCommit={(v) => onChange({ delayMs: v })} />}
      >
        <Slider
          min={0}
          max={DELAY_SLIDER_STEPS}
          step={1}
          value={[delayToSlider(params.delayMs, mode)]}
          onValueChange={([v]) => onChange({ delayMs: sliderToDelay(v, mode) })}
          aria-label="Décalage entre les copies"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground/70">
          <span>{formatDelay(range.min)}</span>
          <span>{formatDelay(sliderToDelay(DELAY_SLIDER_STEPS / 2, mode))}</span>
          <span>{formatDelay(range.max)}</span>
        </div>
        {mode === "youtube" && params.delayMs < YOUTUBE_PRECISE_FROM_MS && params.voices > 1 && (
          <p className="mt-2 flex gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            YouTube ne permet pas de synchro au milliseconde près : sous ~100 ms le décalage est approximatif. Pour du chorus / flanger
            exact, utilise un fichier local.
          </p>
        )}
      </Row>

      <Row icon={<AudioLines />} label="Persistance" value={`${Math.round(params.persistence * 100)} %`}>
        <Slider
          min={0.1}
          max={1}
          step={0.01}
          value={[params.persistence]}
          onValueChange={([v]) => onChange({ persistence: v })}
          aria-label="Volume conservé d'une copie à la suivante"
        />
        <p className="mt-1 text-[11px] text-muted-foreground/70">Volume gardé d&apos;une copie à la suivante. 100 % = toutes au même niveau.</p>
      </Row>

      {mode === "file" && (
        <Row icon={<MoveHorizontal />} label="Largeur stéréo" value={`${Math.round(params.spread * 100)} %`}>
          <Slider min={0} max={1} step={0.01} value={[params.spread]} onValueChange={([v]) => onChange({ spread: v })} aria-label="Largeur stéréo" />
        </Row>
      )}

      <Row icon={<Volume2 />} label="Volume général" value={`${Math.round(params.volume * 100)} %`}>
        <Slider min={0} max={1} step={0.01} value={[params.volume]} onValueChange={([v]) => onChange({ volume: v })} aria-label="Volume général" />
      </Row>

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
        <Gauge className="h-3.5 w-3.5" /> Espace = lecture / pause
      </p>
    </section>
  );
}

function Row({ icon, label, value, children }: { icon: React.ReactNode; label: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground/90 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-accent">
          {icon}
          {label}
        </span>
        <span className="font-headline text-sm font-semibold tabular-nums text-primary">{value}</span>
      </div>
      {children}
    </div>
  );
}

/** Exact numeric entry for the delay, committed on Enter / blur. */
function DelayInput({ value, min, max, onCommit }: { value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const commit = () => {
    const v = parseFloat(text.replace(",", "."));
    if (Number.isFinite(v)) onCommit(roundDelay(clamp(v, min, max)));
    else setText(String(value));
  };

  return (
    <label className="flex items-baseline gap-1">
      <input
        inputMode="decimal"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          e.stopPropagation();
        }}
        className="w-16 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-right tabular-nums outline-none focus:border-primary"
        aria-label="Décalage en millisecondes"
      />
      <span className="text-xs text-muted-foreground">ms</span>
    </label>
  );
}
