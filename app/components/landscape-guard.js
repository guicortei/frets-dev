"use client";

import { useEffect, useState } from "react";

function isPortraitViewport() {
  if (typeof window === "undefined") return false;
  const mediaPortrait = window.matchMedia?.("(orientation: portrait)")?.matches;
  const orientationType = screen.orientation?.type || "";
  const screenPortrait = orientationType.startsWith("portrait");

  // Use a tolerance because standalone PWAs on mobile can report
  // transient dimensions while browser UI/safe-areas are settling.
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  const dimensionPortrait = width + 24 < height;

  // Prefer media query when available, then orientation API, then dimensions.
  if (typeof mediaPortrait === "boolean") return mediaPortrait || dimensionPortrait;
  if (orientationType) return screenPortrait || dimensionPortrait;
  return dimensionPortrait;
}

export default function LandscapeGuard() {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => {
      setIsPortrait(isPortraitViewport());
    };

    const tryLockLandscape = async () => {
      try {
        if (
          screen.orientation &&
          typeof screen.orientation.lock === "function"
        ) {
          await screen.orientation.lock("landscape");
        }
      } catch {
        // Browsers may require fullscreen or standalone mode for lock.
      }
    };

    update();
    tryLockLandscape();

    const media = window.matchMedia?.("(orientation: portrait)");

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    screen.orientation?.addEventListener?.("change", update);
    media?.addEventListener?.("change", update);
    document.addEventListener("visibilitychange", tryLockLandscape);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      screen.orientation?.removeEventListener?.("change", update);
      media?.removeEventListener?.("change", update);
      document.removeEventListener("visibilitychange", tryLockLandscape);
    };
  }, []);

  if (!isPortrait) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/96 p-5 text-center">
      <div className="max-w-sm rounded-xl border border-cyan-300/35 bg-slate-900/92 p-4 shadow-2xl shadow-black/70">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-cyan-100">
          Landscape required
        </p>
        <p className="mt-2 text-sm text-slate-200">
          Rotate your device to landscape to continue.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Gire o dispositivo para o modo paisagem para continuar.
        </p>
      </div>
    </div>
  );
}
