// frontend/app/pico/thermo-motor/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { pageWrap, headerBar } from "./components/ui";
import ThermoMotorProtected from "./components/ThermoMotorProtected";
import LogPanel from "./components/LogPanel";
import { useBaseURL, useLogger } from "./lib/hooks";
import {
  grantSession,
  isLocked,
  readAllow,
  readSession,
  readTTL,
  revokeSession,
  // NEW: setter so "Lock now" actually locks
  setLocked as setLockedInStorage,
} from "./lib/storage";
import { jgetPico } from "./lib/api";
import type { AllowItem } from "./lib/types";
import { btnDark, card, errorBox, row } from "./components/ui";

export default function Page() {
  const { input, setInput, baseURL } = useBaseURL();
  const logger = useLogger();

  const [locked, setLocked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [allow, setAllow] = useState<AllowItem[]>([]);
  const [ttl, setTTL] = useState(300);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState("");

  // Recompute UI auth state from storage
  function refreshAuth() {
    const lk = isLocked();
    setLocked(lk);
    setAllow(readAllow());
    setTTL(readTTL());
    const s = readSession();
    setAuthorized(!lk || !!s);
  }

  useEffect(() => {
    refreshAuth();
    // Keep in sync if other tabs/pages change storage
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key.includes("pico.locked") ||
        e.key.includes("pico.session") ||
        e.key.includes("pico.allow") ||
        e.key.includes("pico.ttl")
      ) {
        refreshAuth();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scanGrant() {
    setGateError("");
    setGateBusy(true);
    try {
      const js = await jgetPico<{ uid: string | null; at_ms: number; age_ms: number }>(
        baseURL,
        "/api/rfid/scan",
        { ms: 3000 }
      );
      if (!js.uid) {
        setGateError("No tag detected. Hold the card on the reader.");
        return;
      }
      if (!allow.some((x) => x.uid === js.uid)) {
        setGateError(`UID ${js.uid} is not allowed.`);
        logger.push("access", "warn", "Denied tag", { uid: js.uid });
        return;
      }
      grantSession(js.uid, ttl);
      logger.push("access", "info", "Access granted", { uid: js.uid, ttl });
      // After granting, recompute auth (locked stays true; session makes authorized true)
      refreshAuth();
    } catch (e: any) {
      setGateError(e?.message || "Scan failed");
      logger.push("access", "error", "Scan failed", { error: String(e?.message || e) });
    } finally {
      setGateBusy(false);
    }
  }

  return (
    <main style={pageWrap}>
      <div style={headerBar}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
            Thermo ⇄ Motor + Humidity
          </h1>
        </div>
        <Link href="/pico" style={{ color: "#374151", textDecoration: "none" }}>
          ← Back
        </Link>
      </div>

      {locked && !authorized ? (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={row}>
            <input
              placeholder="http://pico-w.local or 192.168.1.42"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ width: 320, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}
            />
            <button onClick={scanGrant} disabled={!baseURL || gateBusy} style={btnDark}>
              {gateBusy ? "Scanning…" : "Scan to Enter"}
            </button>
            <Link href="/pico/access" style={{ marginLeft: 8, color: "#374151", textDecoration: "none" }}>
              Manage Access →
            </Link>
          </div>
          {!!gateError && (
            <div style={{ ...errorBox, marginTop: 12 }}>
              <b>Access denied</b>
              <div style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{gateError}</div>
            </div>
          )}
        </div>
      ) : (
        <ThermoMotorProtected
          baseURL={baseURL}
          input={input}
          setInput={setInput}
          logger={logger}
          onRelock={() => {
            // Actually lock, revoke session, and refresh UI
            setLockedInStorage(true);
            revokeSession();
            refreshAuth();
            logger.push("access", "info", "Session revoked manually");
          }}
        />
      )}

      <LogPanel
        filtered={logger.filtered}
        filters={logger.filters}
        setFilters={logger.setFilters}
        clear={logger.clear}
        exportJSON={logger.exportJSON}
        unread={logger.unread}
        markAllRead={logger.markAllRead}
      />
    </main>
  );
}
