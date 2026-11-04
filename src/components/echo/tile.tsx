import { cn } from "@/lib/utils";
import { EchoParams, formatDelay, voiceColor, voiceGain } from "@/lib/echo";

export function gridColumns(n: number) {
  if (n <= 1) return "grid-cols-1";
  if (n <= 4) return "grid-cols-2";
  if (n <= 9) return "grid-cols-3";
  return "grid-cols-3 sm:grid-cols-4";
}

/** A grid cell holding one copy (video, canvas or YouTube player) with its label. */
export function Tile({
  index,
  params,
  children,
  loading,
  bare,
}: {
  index: number;
  params: EchoParams;
  children: React.ReactNode;
  loading?: boolean;
  /** no label / glow (audio-only files) */
  bare?: boolean;
}) {
  const { voices, delayMs, persistence } = params;
  const color = voiceColor(index, voices);
  // dim the copies the way they are attenuated
  const level = voiceGain(index, persistence);

  return (
    <div
      className="group relative aspect-video overflow-hidden rounded-xl bg-black ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-300"
      style={bare ? undefined : { boxShadow: `0 0 0 1px ${voiceColor(index, voices, 0.35)}, 0 0 22px -6px ${voiceColor(index, voices, 0.6)}` }}
    >
      <div className="absolute inset-0 transition-opacity" style={{ opacity: index === 0 ? 1 : 0.35 + 0.65 * level }}>
        {children}
      </div>
      {index > 0 && <div className="pointer-events-auto absolute inset-0" aria-hidden />}
      {!bare && <span
        className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium backdrop-blur"
        style={{ color }}
      >
        {index === 0 ? "Original" : `+${formatDelay(index * delayMs)}`}
      </span>}
      {loading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className={cn("h-6 w-6 animate-spin rounded-full border-2 border-white/20")} style={{ borderTopColor: color }} />
        </div>
      )}
    </div>
  );
}
