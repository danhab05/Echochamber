"use client";

import { useEffect, useRef } from "react";
import { EchoAudioEngine } from "@/lib/audio-engine";
import { EchoParams, voiceColor } from "@/lib/echo";

/** Concentric rings, one per copy, each one drawing its own (delayed) waveform. */
export function Visualizer({ engine, params }: { engine: EchoAudioEngine | null; params: EchoParams }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const buf = new Float32Array(1024);
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { width: w, height: h } = canvas;
      const { voices } = paramsRef.current;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.46;
      const base = maxR * 0.22;
      const step = voices > 1 ? (maxR - base) / voices : 0;

      for (let i = voices - 1; i >= 0; i--) {
        const analyser = engine?.voices[i]?.analyser;
        if (analyser) analyser.getFloatTimeDomainData(buf);
        else buf.fill(0);
        const r = base + i * step;
        const amp = maxR * 0.18;
        ctx.beginPath();
        const points = 160;
        for (let k = 0; k <= points; k++) {
          const a = (k / points) * Math.PI * 2 - Math.PI / 2;
          const s = buf[Math.floor((k % points) * (buf.length / points))] || 0;
          const rr = r + s * amp;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = voiceColor(i, voices, i === 0 ? 1 : 0.85);
        ctx.lineWidth = (i === 0 ? 3 : 2) * (w / canvas.clientWidth || 1);
        ctx.shadowColor = voiceColor(i, voices, 0.9);
        ctx.shadowBlur = 18;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [engine]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
