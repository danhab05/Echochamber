"use client";

import { useEffect, useRef } from "react";

/** Space bar toggles playback, unless the user is typing somewhere. */
export function usePlayPauseShortcut(toggle: () => void, enabled = true) {
  const ref = useRef(toggle);
  ref.current = toggle;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName))) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
