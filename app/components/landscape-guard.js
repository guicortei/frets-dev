"use client";

import { useEffect, useState } from "react";

function isPortraitViewport() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < window.innerHeight;
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

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    document.addEventListener("visibilitychange", tryLockLandscape);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
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
