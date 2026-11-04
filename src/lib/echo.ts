export type SourceMode = "youtube" | "file";

export interface EchoParams {
  /** Total number of copies, the original included (1 = no echo). */
  voices: number;
  /** Offset between two consecutive copies, in milliseconds. */
  delayMs: number;
  /** Volume kept from one copy to the next (0..1). 1 = every copy at the same volume. */
  persistence: number;
  /** Stereo width of the copies (0..1). Local files only. */
  spread: number;
  /** Master volume (0..1). */
  volume: number;
}

export const MAX_VOICES = 12;

export const DEFAULT_PARAMS: EchoParams = {
  voices: 4,
  delayMs: 180,
  persistence: 0.75,
  spread: 0.6,
  volume: 0.8,
};

/** Delay range per source. YouTube players can't be synced tighter than a few tens of ms. */
export const DELAY_RANGE: Record<SourceMode, { min: number; max: number }> = {
  file: { min: 0.1, max: 1000 },
  youtube: { min: 20, max: 1000 },
};

/** Under this delay the YouTube sync is only approximate. */
export const YOUTUBE_PRECISE_FROM_MS = 100;

export interface Preset {
  id: string;
  label: string;
  hint: string;
  params: Partial<EchoParams>;
  fileOnly?: boolean;
}

export const PRESETS: Preset[] = [
  { id: "flanger", label: "Flanger", hint: "0.8 ms", params: { voices: 2, delayMs: 0.8, persistence: 1, spread: 0 }, fileOnly: true },
  { id: "chorus", label: "Chorus", hint: "12 ms", params: { voices: 4, delayMs: 12, persistence: 0.9, spread: 0.8 }, fileOnly: true },
  { id: "double", label: "Doubleur", hint: "35 ms", params: { voices: 2, delayMs: 35, persistence: 0.85, spread: 1 } },
  { id: "slap", label: "Slapback", hint: "120 ms", params: { voices: 2, delayMs: 120, persistence: 0.6, spread: 0.3 } },
  { id: "echo", label: "Écho", hint: "320 ms", params: { voices: 5, delayMs: 320, persistence: 0.6, spread: 0.6 } },
  { id: "canyon", label: "Canyon", hint: "650 ms", params: { voices: 7, delayMs: 650, persistence: 0.7, spread: 0.9 } },
  { id: "crowd", label: "Foule", hint: "12 × 60 ms", params: { voices: 12, delayMs: 60, persistence: 0.95, spread: 1 } },
];

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Raw (un-normalised) gain of voice `i`. */
export function voiceGain(i: number, persistence: number) {
  return Math.pow(persistence, i);
}

/**
 * Gain applied to every voice so the overall loudness stays roughly constant
 * when copies are added (power normalisation).
 */
export function normalisation(voices: number, persistence: number) {
  let sum = 0;
  for (let i = 0; i < voices; i++) sum += voiceGain(i, persistence) ** 2;
  return 1 / Math.sqrt(Math.max(1, sum));
}

/** Pan position (-1..1) of voice `i`: copies alternate left/right and widen. */
export function voicePan(i: number, voices: number, spread: number) {
  if (i === 0 || voices < 2) return 0;
  const side = i % 2 === 1 ? -1 : 1;
  const steps = Math.ceil((voices - 1) / 2);
  return side * spread * Math.min(1, Math.ceil(i / 2) / steps);
}

/** Perceptual volume curve for the master slider. */
export function volumeCurve(v: number) {
  return v * v;
}

// Log-scale mapping for the delay slider so sub-millisecond values stay usable.
export const DELAY_SLIDER_STEPS = 1000;

export function delayToSlider(ms: number, mode: SourceMode) {
  const { min, max } = DELAY_RANGE[mode];
  const v = clamp(ms, min, max);
  return Math.round((DELAY_SLIDER_STEPS * Math.log(v / min)) / Math.log(max / min));
}

export function sliderToDelay(pos: number, mode: SourceMode) {
  const { min, max } = DELAY_RANGE[mode];
  return roundDelay(min * Math.pow(max / min, pos / DELAY_SLIDER_STEPS));
}

export function roundDelay(ms: number) {
  if (ms < 1) return Math.round(ms * 100) / 100;
  if (ms < 10) return Math.round(ms * 10) / 10;
  return Math.round(ms);
}

export function formatDelay(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Accepts every common YouTube URL shape, or a bare 11-character id. */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  const valid = (id: string | null | undefined) => (id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null);

  if (host === "youtu.be") return valid(url.pathname.split("/")[1]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = valid(url.searchParams.get("v"));
    if (v) return v;
    const [, kind, id] = url.pathname.split("/");
    if (["embed", "shorts", "live", "v", "e"].includes(kind)) return valid(id);
  }
  return null;
}

/** Colour of voice `i`, from neon blue (original) to magenta (last echo). */
export function voiceColor(i: number, voices: number, alpha = 1) {
  const t = voices <= 1 ? 0 : i / (voices - 1);
  const hue = 205 + t * 125; // 205 (blue) -> 330 (magenta)
  return `hsla(${hue % 360}, 95%, ${66 - t * 4}%, ${alpha})`;
}
