export const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

export function roundToGrid(n: number) {
  return Math.round(n);
}

export const FORWARD_KEYS = new Set(["w", "z", "ArrowUp"]);
export const BACKWARD_KEYS = new Set(["s", "ArrowDown"]);
export const LEFT_KEYS = new Set(["a", "q", "ArrowLeft"]);
export const RIGHT_KEYS = new Set(["d", "ArrowRight"]);
