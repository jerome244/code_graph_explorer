"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { TerminalWS, type TermInbound } from "./lib/term-ws";

export type LogLine = { type: "out" | "err" | "info"; text: string };

export function useTerminalStream(projectId: number, token?: string) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const wsRef = useRef<TerminalWS | null>(null);

  useEffect(() => {
    const base =
      process.env.NEXT_PUBLIC_WS_BASE ||
      (typeof window !== "undefined"
        ? (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host
        : "");
    const url = base + `/ws/projects/${projectId}/terminal/`;
    const ws = new TerminalWS(url, token);
    wsRef.current = ws;

    const push = (type: LogLine["type"], text: string) =>
      setLines((arr) => [...arr, { type, text }]);

    const unsub = ws.on((msg: TermInbound) => {
      if (msg.type === "out") push("out", msg.text);
      else if (msg.type === "err") push("err", msg.text);
      else if (msg.type === "info") push("info", msg.message);
      else if (msg.type === "started") push("info", `▶ ${msg.cmd} (pid ${msg.pid})`);
      else if (msg.type === "exit") push("info", `⏹ exited with code ${msg.code}`);
      else if (msg.type === "error") push("err", `error: ${msg.message}`);
    });

    ws.connect();
    return () => {
      unsub();
      ws.close();
    };
  }, [projectId, token]);

  const api = useMemo(
    () => ({
      run(cmd: string, cwd?: string) {
        wsRef.current?.send({ type: "run", cmd, cwd });
      },
      stop() {
        wsRef.current?.send({ type: "stop" });
      },
      clear() {
        setLines([]);
      },
    }),
    []
  );

  return { lines, ...api };
}
