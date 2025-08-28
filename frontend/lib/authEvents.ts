// Tiny cross-tab/page notifier for login/logout.
export function emitAuthChanged() {
  try { localStorage.setItem("auth:changed", String(Date.now())); } catch {}
  try {
    const bc = new BroadcastChannel("auth");
    bc.postMessage({ type: "auth:changed", t: Date.now() });
    bc.close();
  } catch {}
  try { window.dispatchEvent(new Event("auth:changed")); } catch {}
}

export function subscribeAuthChanged(cb: () => void) {
  const onCustom = () => cb();
  const onStorage = (e: StorageEvent) => { if (e.key === "auth:changed") cb(); };
  let bc: BroadcastChannel | null = null;

  window.addEventListener("auth:changed", onCustom);
  window.addEventListener("storage", onStorage);
  try {
    bc = new BroadcastChannel("auth");
    bc.onmessage = (e) => { if (e?.data?.type === "auth:changed") cb(); };
  } catch {}

  return () => {
    window.removeEventListener("auth:changed", onCustom);
    window.removeEventListener("storage", onStorage);
    if (bc) bc.close();
  };
}
