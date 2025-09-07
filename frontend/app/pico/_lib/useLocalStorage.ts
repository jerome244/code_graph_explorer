"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe localStorage hook:
 * - First render uses `initial` (same on server & client) → no hydration mismatch.
 * - After mount, loads from localStorage (if present) and updates state.
 * - Writes back to localStorage whenever value changes (post-mount).
 * Returns [value, setValue, ready] where `ready` is true after first mount.
 */
export function useLocalStorage(key: string, initial: string) {
  const [value, setValue] = useState<string>(initial);
  const [ready, setReady] = useState(false);

  // Load from localStorage after mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved !== null) setValue(saved);
    } catch {}
    setReady(true);
  }, [key]);

  // Persist changes (only after we’ve mounted)
  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(key, value); } catch {}
  }, [key, value, ready]);

  return [value, setValue, ready] as const;
}
