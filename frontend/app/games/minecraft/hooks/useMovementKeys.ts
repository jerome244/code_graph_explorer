import * as React from "react";

export function useMovementKeys() {
  const code = React.useRef<Record<string, boolean>>({});
  const char = React.useRef<Record<string, boolean>>({});

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      code.current[e.code] = true;
      char.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      code.current[e.code] = false;
      char.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return {
    get: () => ({
      forward: code.current["KeyW"] || char.current["z"],
      back:    code.current["KeyS"] || char.current["s"],
      right:   code.current["KeyD"] || char.current["d"],
      left:    code.current["KeyA"] || char.current["q"],
      jump:    code.current["Space"] || char.current[" "],
      sprint:  code.current["ShiftLeft"] || code.current["ShiftRight"],
    }),
  };
}
