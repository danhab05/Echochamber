
"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Youtube, Layers, Play, Pause, Music4, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export default function Home() {
  const [videoUrl, setVideoUrl] = useState<string>('https://www.youtube.com/watch?v=2zNSgSzhBfM');
  const [instanceCount, setInstanceCount] = useState<number[]>([3]);
  const [delay, setDelay] = useState<number[]>([120]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isApiReady, setIsApiReady] = useState<boolean>(false);
  const [arePlayersReady, setArePlayersReady] = useState<boolean>(false);
  const [videoKey, setVideoKey] = useState<string>(Date.now().toString());

  const playersRef = useRef<any[]>([]);
  const readyPlayersCount = useRef(0);
  const mainPlayerState = useRef<number>(-1);

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
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }
      }
      window.onYouTubeIframeAPIReady = onApiReady;
    }

    return () => {
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

  const resetState = useCallback(() => {
    setIsPlaying(false);
    setArePlayersReady(false);
    readyPlayersCount.current = 0;
    mainPlayerState.current = -1;
    playersRef.current.forEach(player => {
      if (player && typeof player.destroy === 'function') {
        player.destroy();
      }
    });
    playersRef.current = [];
    setVideoKey(Date.now().toString());
  }, []);

  useEffect(() => {
    if (videoUrl && !videoId) {
      handleUrlError();
    }
    resetState();
  }, [videoUrl, videoId, handleUrlError, instanceCount, resetState]);


  const createPlayers = useCallback(() => {
    if (!isApiReady || !videoId) return;

    const onPlayerReady = (event: any) => {
        const playerIndex = playersRef.current.findIndex(p => p && p.getIframe && event.target.getIframe && p.getIframe().id === event.target.getIframe().id);
        
        readyPlayersCount.current += 1;

        if (playerIndex === 0) {
          event.target.unMute();
          event.target.setVolume(100);
        } else if (playerIndex > 0) {
          event.target.unMute();
          const volume = Math.max(0, 100 - (playerIndex * 25));
          event.target.setVolume(volume);
        }

        if (readyPlayersCount.current === instanceCount[0]) {
            setArePlayersReady(true);
        }
    };
    
    const onMainPlayerStateChange = (event: any) => {
      const newState = event.data;
      if (mainPlayerState.current === newState) return;
      mainPlayerState.current = newState;
      
      const mainPlayer = playersRef.current[0];
      if (!mainPlayer || typeof mainPlayer.getCurrentTime !== 'function') return;

      const currentTime = mainPlayer.getCurrentTime();
      if (typeof currentTime !== 'number') return;
  
      if (newState === window.YT.PlayerState.PLAYING) {
        setIsPlaying(true);
        playersRef.current.forEach((player, index) => {
          if (index === 0) return;
          setTimeout(() => {
            if (mainPlayerState.current === window.YT.PlayerState.PLAYING) {
              if (player && typeof player.seekTo === 'function' && typeof player.playVideo === 'function') {
                player.seekTo(currentTime, true);
                player.playVideo();
              }
            }
          }, index * delay[0]);
        });
      } else if (newState === window.YT.PlayerState.PAUSED || newState === window.YT.PlayerState.ENDED) {
        setIsPlaying(false);
        playersRef.current.forEach(p => p?.pauseVideo());
      }
    };
    
    const onMainPlayerSeek = (currentTime: number) => {
      playersRef.current.forEach((player, index) => {
          if (player && typeof player.seekTo === 'function') {
             setTimeout(() => {
               player.seekTo(currentTime, true);
               if (isPlaying) {
                 player.playVideo();
               }
             }, index * delay[0]);
          }
      });
    };
    
    playersRef.current = Array.from({ length: instanceCount[0] }).map((_, i) => {
      const container = document.getElementById(`player-container-${i}`);
      if (container) {
        const player = new window.YT.Player(container, {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            playsinline: 1,
            controls: i === 0 ? 1 : 0,
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
            disablekb: i === 0 ? 0 : 1,
            origin: window.location.origin
          },
          events: {
            'onReady': onPlayerReady,
            'onStateChange': i === 0 ? onMainPlayerStateChange : undefined,
          }
        });

        if (i === 0) {
            let lastTime = -1;
            const checkSeek = setInterval(() => {
                const p = playersRef.current[0];
                if (p && typeof p.getPlayerState === 'function') {
                    const playerState = p.getPlayerState();
                    if (playerState !== window.YT.PlayerState.PLAYING && playerState !== window.YT.PlayerState.PAUSED) {
                        return;
                    }
                    const currentTime = p.getCurrentTime();
                    if (lastTime !== -1 && Math.abs(currentTime - lastTime) > 1.5) {
                        onMainPlayerSeek(currentTime);
                    }
                    lastTime = currentTime;
                } else {
                    clearInterval(checkSeek);
                }
            }, 500);
          }
        return player;
      }
      return null;
    }).filter(p => p !== null);

  }, [isApiReady, videoId, instanceCount, delay, isPlaying]);

  useEffect(() => {
    if(isApiReady && videoId) {
      createPlayers();
    }
    return () => {
      // This is a failsafe cleanup
      playersRef.current.forEach(player => {
        if (player && typeof player.destroy === 'function') {
          player.destroy();
        }
      });
    };
  }, [videoKey, isApiReady, videoId, createPlayers]);

  const handlePlayPause = () => {
    if (!arePlayersReady) return;
  
    const mainPlayer = playersRef.current[0];
    if (!mainPlayer || typeof mainPlayer.getPlayerState !== 'function') return;

    const playerState = mainPlayer.getPlayerState();
  
    if (playerState === window.YT.PlayerState.PLAYING) {
      mainPlayer.pauseVideo();
    } else {
      mainPlayer.playVideo();
    }
  };
  
  const gridCols = useMemo(() => {
    const count = instanceCount[0];
    if (count <= 1) return 'grid-cols-1';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 9) return 'grid-cols-3';
    return 'grid-cols-3'; // Max
  }, [instanceCount]);


  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4 sm:p-6 md:p-8 overflow-hidden">
      <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(hsl(var(--primary)/0.15)_1px,transparent_1px)] [background-size:16px_16px]"></div>
      <Card className="w-full max-w-4xl bg-card/80 backdrop-blur-xl border-primary/20 shadow-2xl shadow-primary/10 transition-all animate-in fade-in duration-500">
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <label htmlFor="instances" className="text-sm font-medium flex items-center gap-2 text-accent">
                <Layers className="w-5 h-5" />
                Echo Instances: <span className="font-bold text-primary text-lg">{instanceCount[0]}</span>
              </label>
              <Slider
                id="instances"
                min={1}
                max={9}
                step={1}
                value={instanceCount}
                onValueChange={setInstanceCount}
              />
            </div>

            <div className="space-y-4">
              <label htmlFor="delay" className="text-sm font-medium flex items-center gap-2 text-accent">
                <Timer className="w-5 h-5" />
                Echo Delay: <span className="font-bold text-primary text-lg">{delay[0]}ms</span>
              </label>
              <Slider
                id="delay"
                min={10}
                max={500}
                step={10}
                value={delay}
                onValueChange={setDelay}
              />
            </div>
          </div>

          <div key={videoKey} className={cn(
            "relative w-full rounded-lg overflow-hidden bg-black/50 transition-all duration-500 ease-in-out border-2 border-transparent",
            videoId ? 'h-auto border-primary/20' : 'h-0 py-0 border-0 scale-95 opacity-0'
          )}>
            <div className={cn("grid gap-1", gridCols)}>
              {Array.from({ length: instanceCount[0] }).map((_, i) => (
                <div key={i} className="aspect-video relative group/player">
                   <div id={`player-container-${i}`} className="w-full h-full"></div>
                   {i > 0 && <div className="absolute inset-0 bg-black/50 group-hover/player:bg-black/20 transition-colors pointer-events-none"></div>}
                </div>
              ))}
            </div>
            {!videoId && (
               <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <p>Enter a valid YouTube URL to begin</p>
               </div>
            )}
             {(!arePlayersReady && videoId) && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white z-10">
                    <p>Loading players...</p>
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
