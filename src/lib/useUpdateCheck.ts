import { useEffect, useState } from "react";

// The version baked into this bundle at build time (see vite.config.ts `define`).
// `typeof` keeps this safe even where the global isn't defined (e.g. unit tests).
const CURRENT: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";

/** Pure: prompt a refresh only when both versions are known and differ. */
export function isOutdated(current: string, latest: string | null): boolean {
  return Boolean(current) && Boolean(latest) && latest !== current;
}

async function fetchLatest(): Promise<string | null> {
  try {
    // Cache-busted + no-store so we always read the freshly deployed file.
    const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Polls version.json and returns true once a newer build is live. Checks every
 * few minutes and whenever the tab regains focus, so a left-open tab notices a
 * deploy without the user reloading. No-ops in dev (no version.json to read).
 */
export function useUpdateCheck(): boolean {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!CURRENT) return; // dev server / not a real build — nothing to compare
    let active = true;

    async function check() {
      if (!active || document.hidden) return;
      const latest = await fetchLatest();
      if (active && isOutdated(CURRENT, latest)) setOutdated(true);
    }

    const interval = setInterval(check, 5 * 60 * 1000); // every 5 minutes
    const initial = setTimeout(check, 30 * 1000); // a bit after load
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(initial);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return outdated;
}
