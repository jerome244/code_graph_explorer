// frontend/lib/useMoveEmitter.ts
import throttle from "lodash.throttle";
import { useEffect, useMemo } from "react";

export type Position = { x: number; y: number };

export function useMoveEmitter(send: (msg: unknown) => void, fps = 16) {
  const intervalMs = Math.max(1, Math.round(1000 / fps)); // e.g., 16fps → ~60ms

  const emitMove = useMemo(
    () =>
      throttle(
        (id: string, position: Position) => {
          send({ type: "MOVE_NODE", payload: { id, position } });
        },
        intervalMs,
        { leading: true, trailing: true }
      ),
    [send, intervalMs]
  );

  // ensure pending trailing call is sent and timers are cleaned up
  useEffect(() => () => emitMove.cancel(), [emitMove]);

  return {
    emitMove,
    flush: () => (emitMove as any).flush?.(),
  };
}
