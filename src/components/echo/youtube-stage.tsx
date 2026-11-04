"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, Link2, Youtube } from "lucide-react";
import { EchoParams, parseYouTubeId } from "@/lib/echo";
import { YouTubeEchoController, loadYouTubeApi } from "@/lib/youtube";
import { cn } from "@/lib/utils";
import { Tile, gridColumns } from "./tile";
import { Transport } from "./transport";
import { usePlayPauseShortcut } from "./use-shortcut";

const DEFAULT_URL = "https://youtu.be/Cr8K88UcO0s";
const STORAGE_KEY = "echochamber:youtube-url";

export function YouTubeStage({ params }: { params: EchoParams }) {
  const [controller] = useState(() => new YouTubeEchoController());
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  const [url, setUrl] = useState(DEFAULT_URL);
  const [videoId, setVideoId] = useState<string | null>(() => parseYouTubeId(DEFAULT_URL));
  const [urlError, setUrlError] = useState(false);

  // restore the last video
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const id = saved && parseYouTubeId(saved);
      if (saved && id) {
        setUrl(saved);
        setVideoId(id);
      }
    } catch {}
  }, []);

  useEffect(() => () => controller.destroy(), [controller]);
  useEffect(() => controller.setParams(params), [controller, params]);
  useEffect(() => controller.reset(), [controller, videoId]);

  usePlayPauseShortcut(() => controller.toggle());

  const load = (value: string) => {
    const id = parseYouTubeId(value);
    setUrlError(!id);
    if (!id) return;
    setVideoId(id);
    try {
      localStorage.setItem(STORAGE_KEY, value.trim());
    } catch {}
  };

  const masterReady = !!snap.ready[0];

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load(url);
        }}
      >
        <div className="relative flex-1">
          <Youtube className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-accent" />
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(false);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (parseYouTubeId(text)) setTimeout(() => load(text));
            }}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Colle un lien YouTube…"
            aria-label="Lien YouTube"
            aria-invalid={urlError}
            className={cn(
              "h-12 w-full rounded-xl border bg-black/40 pl-11 pr-3 text-[15px] outline-none transition-colors placeholder:text-muted-foreground/60",
              urlError ? "border-destructive" : "border-white/10 focus:border-primary",
            )}
          />
        </div>
        <button
          type="submit"
          className="flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/10"
        >
          <Link2 className="h-4 w-4" />
          <span className="hidden sm:inline">Charger</span>
        </button>
      </form>

      {(urlError || snap.error) && (
        <p className="flex items-center gap-2 rounded-xl bg-destructive/15 px-3 py-2 text-sm text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {urlError ? "Ce lien n'est pas une vidéo YouTube valide." : snap.error}
        </p>
      )}

      {videoId ? (
        <div className={cn("grid gap-2", gridColumns(params.voices))}>
          {Array.from({ length: params.voices }, (_, i) => (
            <Tile key={`${videoId}-${i}`} index={i} params={params} loading={!snap.ready[i]}>
              <YouTubeSlot index={i} videoId={videoId} controller={controller} />
            </Tile>
          ))}
        </div>
      ) : (
        <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-white/15 text-sm text-muted-foreground">
          Colle un lien YouTube pour commencer
        </div>
      )}

      <Transport
        playing={snap.playing}
        time={snap.time}
        duration={snap.duration}
        disabled={!masterReady || !!snap.error}
        loading={!!videoId && !masterReady && !snap.error}
        onToggle={() => controller.toggle()}
        onSeek={(t) => controller.seek(t)}
      />
    </div>
  );
}

/**
 * Hosts one YouTube player. The player replaces a node we create ourselves,
 * so React never has to reconcile the iframe the API injects.
 */
function YouTubeSlot({ index, videoId, controller }: { index: number; videoId: string; controller: YouTubeEchoController }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mount = document.createElement("div");
    host.appendChild(mount);
    let player: any = null;
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(mount, {
          width: "100%",
          height: "100%",
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => !cancelled && controller.attach(index, player),
            onStateChange: (e: any) => !cancelled && controller.onStateChange(index, e.data),
            onError: (e: any) => !cancelled && controller.onError(index, e.data),
          },
        });
      })
      .catch((err: Error) => controller.onApiError(err.message));

    return () => {
      cancelled = true;
      controller.detach(index);
      try {
        player?.destroy();
      } catch {}
      host.replaceChildren();
    };
  }, [index, videoId, controller]);

  return <div ref={hostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />;
}
