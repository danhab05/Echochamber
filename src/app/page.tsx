"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Youtube, Layers, Play, Pause, Music4 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export default function Home() {
  const [videoUrl, setVideoUrl] = useState<string>('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [instanceCount, setInstanceCount] = useState<number[]>([3]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isApiReady, setIsApiReady] = useState<boolean>(false);
  const [arePlayersReady, setArePlayersReady] = useState<boolean>(false);

  const playersRef = useRef<any[]>([]);
  const readyPlayersCount = useRef(0);
  const { toast } = useToast();

  const videoId = useMemo(() => {
    if (!videoUrl) return null;
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = videoUrl.match(regex);
    return match ? match[1] : null;
  }, [videoUrl]);

  useEffect(() => {
    const onApiReady = () => {
      setIsApiReady(true);
    };

    if (window.YT && window.YT.Player) {
      onApiReady();
    } else {
      window.onYouTubeIframeAPIReady = onApiReady;
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
      }
    }

    return () => {
      // Clean up the global callback
      if (window.onYouTubeIframeAPIReady === onApiReady) {
        delete window.onYouTubeIframeAPIReady;
      }
    };
  }, []);

  const handleUrlError = useCallback(() => {
    toast({
      variant: "destructive",
      title: "Invalid YouTube URL",
      description: "Please paste a valid YouTube video URL.",
    });
  }, [toast]);
  
  const createPlayers = useCallback(() => {
    if (!isApiReady || !videoId) {
      return;
    }

    // Destroy existing players
    playersRef.current.forEach(player => {
      if (player && typeof player.destroy === 'function') {
        player.destroy();
      }
    });
    playersRef.current = [];
    readyPlayersCount.current = 0;
    setArePlayersReady(false);
    setIsPlaying(false);

    if (videoUrl && !videoId) {
      handleUrlError();
      return;
    }
    
    const onPlayerReady = (event: any) => {
        readyPlayersCount.current += 1;
        if (readyPlayersCount.current === instanceCount[0]) {
            setArePlayersReady(true);
        }
    };
    
    Array.from({ length: instanceCount[0] }).forEach((_, i) => {
        const container = document.getElementById(`player-container-${i}`);
        if (container) {
          playersRef.current[i] = new window.YT.Player(container, {
            height: i === 0 ? '100%' : '0',
            width: i === 0 ? '100%' : '0',
            videoId: videoId,
            playerVars: {
              playsinline: 1,
              controls: i === 0 ? 1 : 0,
              autoplay: 0,
              modestbranding: 1,
              rel: 0,
              disablekb: 1,
            },
            events: {
              'onReady': onPlayerReady,
            }
          });
        }
      });
  }, [isApiReady, videoId, instanceCount, handleUrlError]);

  useEffect(() => {
    createPlayers();
    
    // Cleanup function
    return () => {
      playersRef.current.forEach(player => {
        if (player && typeof player.destroy === 'function') {
          player.destroy();
        }
      });
    };
  }, [createPlayers]);


  const handlePlayPause = () => {
    if (!arePlayersReady) return;

    const nextIsPlaying = !isPlaying;
    setIsPlaying(nextIsPlaying);

    playersRef.current.forEach((player, index) => {
      if (player && typeof player.playVideo === 'function' && typeof player.pauseVideo === 'function') {
        if (nextIsPlaying) {
          setTimeout(() => {
            player.seekTo(0);
            player.playVideo();
          }, index * 120); // 120ms echo delay
        } else {
          player.pauseVideo();
        }
      }
    });
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4 sm:p-6 md:p-8 overflow-hidden">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(hsl(var(--primary)/0.15)_1px,transparent_1px)] [background-size:16px_16px]"></div>
      <Card className="w-full max-w-2xl bg-card/80 backdrop-blur-xl border-primary/20 shadow-2xl shadow-primary/10 transition-all animate-in fade-in duration-500">
        <CardHeader className="text-center p-8">
          <div className="flex justify-center items-center gap-3 mb-2">
             <Music4 className="w-10 h-10 text-primary text-glow-primary" />
             <CardTitle className="font-headline text-4xl md:text-5xl tracking-tight font-bold text-glow-primary">EchoChamber</CardTitle>
          </div>
          <CardDescription className="text-muted-foreground">
            Transform any YouTube video into a cascade of sound.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 px-8">
          <div className="space-y-2">
            <label htmlFor="youtube-url" className="text-sm font-medium flex items-center gap-2 text-accent">
              <Youtube className="w-5 h-5" />
              YouTube Video URL
            </label>
            <Input 
              id="youtube-url"
              type="text" 
              placeholder="e.g. https://www.youtube.com/watch?v=..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="bg-background/50 focus:ring-accent focus:ring-2 border-muted-foreground/50 h-11 text-base"
            />
          </div>

          <div className="space-y-4">
            <label htmlFor="instances" className="text-sm font-medium flex items-center gap-2 text-accent">
              <Layers className="w-5 h-5" />
              Echo Instances: <span className="font-bold text-primary text-lg">{instanceCount[0]}</span>
            </label>
            <Slider
              id="instances"
              min={1}
              max={10}
              step={1}
              value={instanceCount}
              onValueChange={(value) => {
                setIsPlaying(false);
                setArePlayersReady(false);
                setInstanceCount(value);
              }}
            />
          </div>

          <div className={cn("relative aspect-video w-full rounded-lg overflow-hidden bg-black transition-all duration-500 ease-in-out border-2 border-transparent", videoId ? 'h-auto border-primary/20' : 'h-0 py-0 border-0 scale-95 opacity-0')}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} id={`player-container-${i}`} className={cn(i === 0 ? 'w-full h-full' : 'w-0 h-0 absolute')}></div>
              ))}
              {!videoId && (
                 <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <p>Enter a valid YouTube URL to begin</p>
                 </div>
              )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-center p-8">
          <Button 
            size="lg" 
            onClick={handlePlayPause} 
            disabled={!videoId || !arePlayersReady}
            className="w-48 h-14 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-lg font-bold transition-all duration-300 hover:shadow-lg hover:shadow-primary/30 active:scale-95 disabled:bg-muted disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

    