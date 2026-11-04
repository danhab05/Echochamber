import { EchoParams, SourceMode, formatDelay, normalisation, voiceGain, voiceColor } from "@/lib/echo";

/** Small diagram of the copies: one pulse per copy, height = volume, x = time offset. */
export function EchoTrain({ params, mode }: { params: EchoParams; mode: SourceMode }) {
  const { voices, delayMs, persistence } = params;
  const total = Math.max(delayMs * (voices - 1), 1e-6);
  const norm = normalisation(voices, persistence);
  const W = 300;
  const H = 64;
  const pad = 8;

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 pb-2 pt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" role="img" aria-label="Répartition des copies dans le temps">
        <line x1={pad} x2={W - pad} y1={H - 6} y2={H - 6} stroke="currentColor" className="text-white/15" />
        {Array.from({ length: voices }, (_, i) => {
          const x = voices === 1 ? W / 2 : pad + ((i * delayMs) / total) * (W - pad * 2);
          const g = voiceGain(i, persistence) * norm;
          const h = Math.max(3, g * (H - 14) * (voices === 1 ? 1 : 1.15));
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={H - 6} y2={H - 6 - Math.min(h, H - 10)} stroke={voiceColor(i, voices)} strokeWidth={3} strokeLinecap="round" />
              <circle cx={x} cy={H - 6 - Math.min(h, H - 10)} r={2.5} fill={voiceColor(i, voices)} />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>original</span>
        <span>
          {voices > 1 ? `dernière copie à +${formatDelay(delayMs * (voices - 1))}` : "aucune copie"}
          {mode === "youtube" && voices > 1 ? ` · ${voices} lecteurs` : ""}
        </span>
      </div>
    </div>
  );
}
