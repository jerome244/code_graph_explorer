'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

type DayNightCtx = {
  /** normalized time of day [0..1) where 0.0 = 00:00, 0.5 = 12:00 */
  t: number;
  /** hours [0..24) */
  hours: number;
  /** change speed multiplier (1 = default) */
  speed: number;
  setSpeed: (s: number) => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
};

const Ctx = createContext<DayNightCtx | null>(null);

/** Provide a looping day/night clock. Default full day = 180 seconds. */
export function DayNightProvider({ children, dayLengthSec = 180 }: { children: React.ReactNode; dayLengthSec?: number; }) {
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [t, setT] = useState(0); // normalized
  const last = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (last.current == null) { last.current = now; return; }
      const dt = (now - last.current) / 1000;
      last.current = now;
      if (!paused) {
        const delta = (dt * speed) / dayLengthSec;
        setT(v => {
          let n = v + delta;
          n -= Math.floor(n); // wrap [0..1)
          return n;
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, speed, dayLengthSec]);

  const ctx = useMemo<DayNightCtx>(() => ({
    t, hours: (t * 24) % 24, speed, setSpeed, paused, setPaused
  }), [t, speed, paused]);

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function useDayNight() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDayNight must be used inside DayNightProvider');
  return v;
}
