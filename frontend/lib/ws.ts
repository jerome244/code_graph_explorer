// lib/ws.ts
export function connectProjectSocket(projectId: string) {
  const url = `${process.env.NEXT_PUBLIC_WS_BASE}/ws/projects/${projectId}/`;
  const ws = new WebSocket(url);
  return ws;
}
