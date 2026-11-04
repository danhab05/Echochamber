import { EchoParams, MAX_VOICES, normalisation, voiceGain, voicePan, volumeCurve } from "./echo";

interface Voice {
  delay: DelayNode;
  gain: GainNode;
  pan: StereoPannerNode;
  analyser: AnalyserNode;
}

const SMOOTHING = 0.03; // seconds, time constant for parameter changes

/**
 * Sample-accurate echo engine for a local <audio>/<video> element.
 *
 *   element ─┬─ delay(0)    ─ gain ─ pan ─┐
 *            ├─ delay(d)    ─ gain ─ pan ─┤
 *            └─ delay(n·d)  ─ gain ─ pan ─┴─ limiter ─ master ─ speakers
 *
 * Every copy reads the very same stream, so the offsets are exact to the
 * sample, down to a fraction of a millisecond.
 */
export class EchoAudioEngine {
  readonly ctx: AudioContext;
  readonly voices: Voice[] = [];
  private readonly source: MediaElementAudioSourceNode;
  private readonly master: GainNode;

  constructor(element: HTMLMediaElement) {
    const Ctx: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    this.source = this.ctx.createMediaElementSource(element);

    const bus = this.ctx.createGain();
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    this.master = this.ctx.createGain();
    bus.connect(limiter).connect(this.master).connect(this.ctx.destination);

    for (let i = 0; i < MAX_VOICES; i++) {
      const delay = this.ctx.createDelay(MAX_VOICES + 1);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const pan = this.ctx.createStereoPanner();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      this.source.connect(delay).connect(gain).connect(pan).connect(bus);
      gain.connect(analyser);
      this.voices.push({ delay, gain, pan, analyser });
    }
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  apply(params: EchoParams, immediate = false) {
    const now = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => {
      if (immediate) {
        p.cancelScheduledValues(now);
        p.setValueAtTime(v, now);
      } else {
        p.setTargetAtTime(v, now, SMOOTHING);
      }
    };
    const norm = normalisation(params.voices, params.persistence);
    this.voices.forEach((v, i) => {
      const active = i < params.voices;
      set(v.delay.delayTime, (i * params.delayMs) / 1000);
      set(v.gain.gain, active ? voiceGain(i, params.persistence) * norm : 0);
      set(v.pan.pan, voicePan(i, params.voices, params.spread));
    });
    set(this.master.gain, volumeCurve(params.volume));
  }

  close() {
    this.source.disconnect();
    void this.ctx.close();
  }
}
