import { EchoParams, DEFAULT_PARAMS, normalisation, voiceGain } from "./echo";

/* ------------------------------------------------------------------ */
/* IFrame API loader                                                   */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;

export function loadYouTubeApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error("Impossible de charger l'API YouTube"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/* ------------------------------------------------------------------ */
/* Multi-player echo controller                                        */
/* ------------------------------------------------------------------ */

const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

const SYNC_INTERVAL = 200; // ms between two sync passes
const TOLERANCE = 0.07; // s of drift tolerated before re-seeking an echo
const FIX_COOLDOWN = 1200; // ms to let a player settle after a correction
const SAMPLES = 3; // drift samples (median) before deciding

export interface YouTubeSnapshot {
  playing: boolean;
  time: number;
  duration: number;
  ready: boolean[];
  error: string | null;
}

const ERRORS: Record<number, string> = {
  2: "Lien YouTube invalide.",
  5: "Cette vidéo ne peut pas être lue dans le lecteur intégré.",
  100: "Vidéo introuvable ou privée.",
  101: "Le propriétaire de la vidéo a désactivé la lecture intégrée.",
  150: "Le propriétaire de la vidéo a désactivé la lecture intégrée.",
};

/**
 * Drives N YouTube players playing the same video, copy `i` being kept
 * `i × delay` behind the original. Player 0 is the clock; every other
 * player is continuously measured against it and re-seeked when it drifts.
 */
export class YouTubeEchoController {
  private players: any[] = [];
  private ready: boolean[] = [];
  private started: boolean[] = [];
  private timers: (ReturnType<typeof setTimeout> | null)[] = [];
  private lastFix: number[] = [];
  private lead: number[] = [];
  private drift: number[][] = [];
  private justFixed: boolean[] = [];

  private params: EchoParams = DEFAULT_PARAMS;
  private playing = false;
  private pos = 0;
  private lastCommand = 0;
  private loop: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: YouTubeSnapshot = { playing: false, time: 0, duration: 0, ready: [], error: null };

  /* ---------- store (useSyncExternalStore) ---------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  private emit(patch: Partial<YouTubeSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    const changed = (Object.keys(patch) as (keyof YouTubeSnapshot)[]).some((k) => next[k] !== this.snapshot[k]);
    if (!changed) return;
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  private emitReady() {
    this.emit({ ready: Array.from({ length: Math.max(this.params.voices, this.ready.length) }, (_, i) => !!this.ready[i]) });
  }

  /* ---------- player lifecycle (called by the slots) ---------- */

  attach(i: number, player: any) {
    this.players[i] = player;
    this.ready[i] = true;
    this.started[i] = false;
    this.lead[i] = 0.12;
    this.drift[i] = [];
    this.lastFix[i] = 0;
    try {
      player.unMute();
    } catch {}
    this.applyVolume(i);
    this.emitReady();
    if (i === 0) {
      this.emit({ duration: player.getDuration?.() || 0, error: null });
      this.ensureLoop();
    }
    // An echo joining while we are already playing is synced by the next pass.
  }

  detach(i: number) {
    this.clearTimer(i);
    this.players[i] = null;
    this.ready[i] = false;
    this.started[i] = false;
    this.emitReady();
  }

  onError(i: number, code: number) {
    if (i === 0) this.emit({ error: ERRORS[code] ?? `Erreur YouTube (${code}).` });
  }

  onApiError(message: string) {
    this.emit({ error: message });
  }

  onStateChange(i: number, state: number) {
    if (state === S.PLAYING || state === S.PAUSED || state === S.BUFFERING) this.started[i] = true;
    if (i !== 0) return;

    const sinceCommand = performance.now() - this.lastCommand;
    if (state === S.ENDED) {
      this.playing = false;
      this.clearTimers();
      this.pos = 0;
      this.emit({ playing: false });
    } else if (state === S.PLAYING) {
      if (!this.playing && sinceCommand > 600) this.play(); // user clicked the main video
      else this.sync();
    } else if (state === S.PAUSED && this.playing && sinceCommand > 600) {
      this.pause(); // user paused from the main video
    }
  }

  /* ---------- params ---------- */

  setParams(p: EchoParams) {
    const delayChanged = p.delayMs !== this.params.delayMs;
    this.params = p;
    this.players.forEach((_, i) => this.applyVolume(i));
    if (delayChanged) {
      // pending start timers were computed with the old delay
      this.clearTimers();
      this.drift = this.drift.map(() => []);
    }
    this.emitReady();
    if (this.playing) this.sync();
  }

  private applyVolume(i: number) {
    const p = this.players[i];
    if (!p || !this.ready[i]) return;
    const { voices, persistence, volume } = this.params;
    const g = i < voices ? volume * voiceGain(i, persistence) * normalisation(voices, persistence) : 0;
    const v = g <= 0 ? 0 : Math.max(1, Math.round(g * 100));
    try {
      p.setVolume(v);
    } catch {}
  }

  /* ---------- transport ---------- */

  private get master() {
    return this.ready[0] ? this.players[0] : null;
  }

  private delayOf(i: number) {
    return (i * this.params.delayMs) / 1000;
  }

  private masterTime() {
    const m = this.master;
    if (!m) return this.pos;
    return this.started[0] ? m.getCurrentTime() || 0 : this.pos;
  }

  play() {
    const m = this.master;
    if (!m) return;
    this.lastCommand = performance.now();
    let t = this.masterTime();
    const duration = m.getDuration?.() || 0;
    if (m.getPlayerState?.() === S.ENDED || (duration && t >= duration - 0.25)) t = 0;

    this.playing = true;
    this.pos = t;
    this.clearTimers();
    for (let i = 0; i < this.params.voices; i++) {
      const p = this.players[i];
      if (!p || !this.ready[i]) continue;
      const target = t - this.delayOf(i);
      if (target >= 0) {
        p.seekTo(target, true);
        p.playVideo();
        this.lastFix[i] = performance.now();
      } else if (this.started[i]) {
        p.pauseVideo();
        p.seekTo(0, true);
      }
    }
    this.emit({ playing: true });
    this.ensureLoop();
  }

  pause() {
    this.lastCommand = performance.now();
    const t = this.masterTime();
    this.playing = false;
    this.clearTimers();
    this.players.forEach((p, i) => {
      if (p && this.ready[i] && this.started[i]) p.pauseVideo();
    });
    this.pos = t;
    this.emit({ playing: false, time: t });
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    const m = this.master;
    if (!m) return;
    this.lastCommand = performance.now();
    this.clearTimers();
    this.pos = t;
    this.players.forEach((p, i) => {
      if (!p || !this.ready[i]) return;
      const target = t - this.delayOf(i);
      this.drift[i] = [];
      if (this.playing) {
        if (target >= 0) {
          p.seekTo(target + (i === 0 ? 0 : this.lead[i]), true);
          this.lastFix[i] = performance.now();
        } else if (this.started[i]) {
          p.pauseVideo();
        }
      } else if (this.started[i]) {
        // seekTo keeps a paused player paused (but would start a cued one)
        p.seekTo(Math.max(0, target), true);
      }
    });
    this.emit({ time: t });
  }

  /* ---------- sync loop ---------- */

  private ensureLoop() {
    if (!this.loop) {
      this.loop = setInterval(() => this.tick(), SYNC_INTERVAL);
      document.addEventListener("visibilitychange", this.onVisibility);
    }
  }

  /** Back from the background: timers may have been throttled, re-measure everything now. */
  private onVisibility = () => {
    if (document.visibilityState !== "visible" || !this.playing) return;
    this.drift = this.drift.map(() => []);
    this.lastFix = this.lastFix.map(() => 0);
    this.sync();
  };

  private tick() {
    const m = this.master;
    if (!m) return;
    const duration = m.getDuration?.() || 0;
    this.emit({ time: this.playing ? this.masterTime() : this.pos, duration });
    if (this.playing) this.sync();
  }

  private sync() {
    const m = this.master;
    if (!m || !this.playing) return;
    if (m.getPlayerState?.() !== S.PLAYING) return; // master buffering: wait for it

    const now = performance.now();
    const mt = m.getCurrentTime() || 0;
    const duration = m.getDuration?.() || Infinity;

    for (let i = 1; i < this.params.voices; i++) {
      const p = this.players[i];
      if (!p || !this.ready[i]) continue;
      const expected = mt - this.delayOf(i);

      if (expected < 0) {
        // clearly too early (e.g. the delay was just increased): hold it until its turn
        if (!this.timers[i] && expected < -0.3 && now - this.lastFix[i] > FIX_COOLDOWN && p.getPlayerState?.() === S.PLAYING) {
          p.pauseVideo();
        }
        // Not its turn yet: start it exactly when the master reaches i × delay.
        if (!this.timers[i]) {
          this.timers[i] = setTimeout(() => this.startEcho(i), -expected * 1000 - this.lead[i] * 1000);
        }
        continue;
      }
      if (this.timers[i] || expected >= duration - 0.15) continue;

      const state = p.getPlayerState?.();
      if (state === S.BUFFERING || now - this.lastFix[i] < FIX_COOLDOWN) continue;

      if (state !== S.PLAYING) {
        this.correct(i, expected, now);
        p.playVideo();
        continue;
      }

      const d = this.drift[i];
      d.push((p.getCurrentTime() || 0) - expected);
      if (d.length > SAMPLES) d.shift();
      if (d.length < SAMPLES) continue;
      const err = [...d].sort((a, b) => a - b)[Math.floor(SAMPLES / 2)];

      if (this.justFixed[i]) {
        // learn how long this player stalls when seeking, to land right on time next time
        this.lead[i] = Math.min(0.8, Math.max(0, this.lead[i] - err * 0.8));
        this.justFixed[i] = false;
      }
      if (Math.abs(err) > TOLERANCE) this.correct(i, expected, now);
    }
  }

  private correct(i: number, expected: number, now: number) {
    this.players[i].seekTo(expected + this.lead[i], true);
    this.lastFix[i] = now;
    this.drift[i] = [];
    this.justFixed[i] = true;
  }

  private startEcho(i: number) {
    this.timers[i] = null;
    const p = this.players[i];
    if (!this.playing || !p || !this.ready[i] || i >= this.params.voices) return;
    // fired `lead` seconds early: seek so the copy lands on time once it has buffered
    p.seekTo(Math.max(0, this.masterTime() - this.delayOf(i) + this.lead[i]), true);
    p.playVideo();
    this.lastFix[i] = performance.now();
    this.drift[i] = [];
    this.justFixed[i] = true;
  }

  private clearTimer(i: number) {
    const t = this.timers[i];
    if (t) clearTimeout(t);
    this.timers[i] = null;
  }

  private clearTimers() {
    this.timers.forEach((_, i) => this.clearTimer(i));
  }

  /** Called when the video changes: forget everything about the previous one. */
  reset() {
    this.clearTimers();
    this.playing = false;
    this.pos = 0;
    this.emit({ playing: false, time: 0, duration: 0, error: null });
  }

  destroy() {
    this.clearTimers();
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
