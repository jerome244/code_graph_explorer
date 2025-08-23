// app/betting/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/* ---------------- Types ---------------- */

type Sport = { key: string; group: string; title: string; active: boolean; has_outrights?: boolean };

type MarketKey = "h2h" | "totals" | "spreads" | "outrights";

type Outcome = {
  name: string;
  price: number;     // decimal or american (based on format)
  point?: number;    // for totals/spreads
};

type Market = { key: MarketKey; outcomes: Outcome[] };

type Bookmaker = {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
};

type Event = {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team?: string;
  away_team?: string;
  bookmakers: Bookmaker[];
};

type ScoreRow = {
  id: string;
  completed: boolean;
  commence_time: string;
  scores?: { name: string; score: string }[];
  last_update?: string;
};

/* ----------- Sim bet types ----------- */

type BetStatus = "pending" | "placed" | "won" | "lost" | "push";

type BetSelection = {
  id: string;                // selection id
  eventId: string;
  match: string;             // "Home vs Away"
  sportKey: string;
  market: MarketKey;
  outcome: string;           // "Arsenal" | "Draw" | etc.
  point?: number;
  price: number;             // decimal only (for P/L math)
  bookmakerKey: string;
  bookmakerTitle: string;
  stake: number;
  status: BetStatus;         // pending while in slip, becomes placed then settled
  placedAt?: string;
  settledAt?: string;
  resultNote?: string;
};

/* -------------- Consts -------------- */

const REGIONS = [
  { key: "eu", label: "Europe (eu)" },
  { key: "uk", label: "United Kingdom (uk)" },
  { key: "us", label: "United States (us)" },
  { key: "au", label: "Australia (au)" },
];

const DEFAULT_REGION =
  (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_DEFAULT_ODDS_REGION) || "eu";

/* -------------- Helpers -------------- */

function impliedFromDecimal(dec: number) {
  if (!dec || dec <= 1) return null;
  return 1 / dec;
}
function impliedFromAmerican(american: number) {
  if (!american) return null;
  if (american > 0) return 100 / (american + 100);
  return -american / (-american + 100);
}
function fmtPct(p: number | null) {
  return p == null ? "" : ` (${(p * 100).toFixed(1)}%)`;
}
function uniqueByKey<T extends { key: string }>(arr: T[]) {
  const m = new Map<string, T>();
  for (const it of arr || []) if (it?.key && !m.has(it.key)) m.set(it.key, it);
  return Array.from(m.values());
}
function sortOutcomes(market: MarketKey, outcomes: Outcome[]) {
  const copy = [...(outcomes || [])];
  if (market === "spreads" || market === "totals") {
    copy.sort((a, b) => {
      const ap = a.point ?? Number.POSITIVE_INFINITY;
      const bp = b.point ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return (b.price ?? 0) - (a.price ?? 0);
    });
  } else {
    copy.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  }
  return copy;
}
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36).slice(2);
}

/* -------- Mock (works without key) -------- */

const MOCK_EVENTS: Event[] = [
  {
    id: "mock1",
    sport_key: "soccer_epl",
    commence_time: new Date(Date.now() + 3600_000).toISOString(),
    home_team: "Arsenal",
    away_team: "Chelsea",
    bookmakers: [
      {
        key: "pinny",
        title: "Pinnacle",
        last_update: new Date().toISOString(),
        markets: [
          { key: "h2h", outcomes: [{ name: "Arsenal", price: 1.95 }, { name: "Draw", price: 3.8 }, { name: "Chelsea", price: 3.9 }] },
          { key: "totals", outcomes: [{ name: "Over", price: 2.0, point: 2.5 }, { name: "Under", price: 1.85, point: 2.5 }] },
          { key: "spreads", outcomes: [{ name: "Arsenal -1", price: 2.9, point: -1 }, { name: "Chelsea +1", price: 1.45, point: 1 }] },
        ],
      },
      {
        key: "bet365",
        title: "Bet365",
        last_update: new Date().toISOString(),
        markets: [
          { key: "h2h", outcomes: [{ name: "Arsenal", price: 2.0 }, { name: "Draw", price: 3.6 }, { name: "Chelsea", price: 3.75 }] },
          { key: "totals", outcomes: [{ name: "Over", price: 1.95, point: 2.5 }, { name: "Under", price: 1.9, point: 2.5 }] },
          { key: "spreads", outcomes: [{ name: "Arsenal -0.5", price: 1.95, point: -0.5 }, { name: "Chelsea +0.5", price: 1.9, point: 0.5 }] },
        ],
      },
    ],
  },
];

/* ---------------- Component ---------------- */

export default function BettingPage() {
  // core state
  const [sports, setSports] = useState<Sport[]>([]);
  const [sportsLoading, setSportsLoading] = useState<boolean>(true);
  const [sport, setSport] = useState<string>("upcoming");
  const [regions, setRegions] = useState<string>(DEFAULT_REGION);
  const [market, setMarket] = useState<MarketKey>("h2h");
  const [format, setFormat] = useState<"decimal" | "american">("decimal");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pins, setPins] = useState<Record<string, boolean>>({});
  const [mock, setMock] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // bookmakers
  const [allBooks, setAllBooks] = useState<{ key: string; title: string }[]>([]);
  const [selectedBooks, setSelectedBooks] = useState<Record<string, boolean>>({});
  const [showBookFilter, setShowBookFilter] = useState(false);
  const [showImplied, setShowImplied] = useState(true);

  // auto refresh
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(0);
  const intervalRef = useRef<number | null>(null);

  // scores
  const [scores, setScores] = useState<Record<string, ScoreRow>>({});

  // simulated betting
  const [bankroll, setBankroll] = useState<number>(1000);
  const [slip, setSlip] = useState<BetSelection[]>([]);
  const [bets, setBets] = useState<BetSelection[]>([]);

  // time formatting
  const tzFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: "Europe/Paris",
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
    }
  }, []);

  /* --------- Load sports --------- */
  const fetchSports = async () => {
    setSportsLoading(true);
    setError("");
    try {
      if (mock) {
        setSports([{ key: "soccer_epl", group: "Soccer", title: "EPL (mock)", active: true }]);
        setSport("soccer_epl");
        return;
      }
      const res = await fetch("/api/odds/sports", { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GET /api/odds/sports → ${res.status}: ${text}`);
      }
      const data = (await res.json()) as Sport[];
      const unique = uniqueByKey((data || []).filter((s) => s?.active));
      unique.sort((a, b) => (a.group + a.title).localeCompare(b.group + b.title));
      setSports(unique);
      const epl = unique.find((s) => s.key === "soccer_epl");
      setSport(epl ? epl.key : (unique[0]?.key || "upcoming"));
    } catch (e: any) {
      setError(e?.message || "Failed to load sports");
      setSports([]);
    } finally {
      setSportsLoading(false);
    }
  };

  useEffect(() => {
    fetchSports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mock]);

  /* --------- Load odds --------- */
  const loadOdds = async () => {
    setLoading(true);
    setError("");
    try {
      let data: Event[];
      if (mock) {
        data = MOCK_EVENTS;
      } else {
        const q = new URLSearchParams({
          sport,
          regions,
          markets: market,
          oddsFormat: format,
        });
        const res = await fetch(`/api/odds?${q.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`GET /api/odds → ${res.status}: ${text}`);
        }
        data = (await res.json()) as Event[];
      }

      // collect bookmaker list & default select all
      const bookMap = new Map<string, string>();
      for (const ev of data) for (const bk of ev.bookmakers || []) bookMap.set(bk.key, bk.title);
      const books = Array.from(bookMap.entries()).map(([key, title]) => ({ key, title }))
        .sort((a, b) => (a.title || a.key).localeCompare(b.title || b.key));
      setAllBooks(books);
      if (Object.keys(selectedBooks).length === 0) {
        const sel: Record<string, boolean> = {};
        books.forEach((b) => (sel[b.key] = true));
        setSelectedBooks(sel);
      }

      // pin sort to top
      data.sort((a, b) => Number(!!pins[b.id]) - Number(!!pins[a.id]));

      setEvents(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e?.message || "Failed to fetch odds");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sport) loadOdds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, regions, market, format, mock]);

  // auto refresh
  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autoRefreshSec > 0) {
      intervalRef.current = window.setInterval(() => loadOdds(), autoRefreshSec * 1000) as unknown as number;
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshSec, sport, regions, market, format, mock]);

  /* --------- Load scores for settlement --------- */
  useEffect(() => {
    (async () => {
      try {
        if (mock || events.length === 0) {
          setScores({});
          return;
        }
        const q = new URLSearchParams({ sport, daysFrom: "3" });
        const res = await fetch(`/api/odds/scores?${q.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ScoreRow[];
        const map: Record<string, ScoreRow> = {};
        for (const s of data || []) map[s.id] = s;
        setScores(map);
      } catch { /* ignore */ }
    })();
  }, [sport, mock, events]);

  /* --------- Persist pins/bankroll/bets locally --------- */
  useEffect(() => {
    try {
      const rawPins = localStorage.getItem("betting.pins");
      if (rawPins) setPins(JSON.parse(rawPins));
      const rawBk = localStorage.getItem("betting.bankroll");
      if (rawBk) setBankroll(parseFloat(rawBk) || 1000);
      const rawSlip = localStorage.getItem("betting.slip");
      if (rawSlip) setSlip(JSON.parse(rawSlip));
      const rawBets = localStorage.getItem("betting.bets");
      if (rawBets) setBets(JSON.parse(rawBets));
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("betting.pins", JSON.stringify(pins)); } catch {} }, [pins]);
  useEffect(() => { try { localStorage.setItem("betting.bankroll", String(bankroll)); } catch {} }, [bankroll]);
  useEffect(() => { try { localStorage.setItem("betting.slip", JSON.stringify(slip)); } catch {} }, [slip]);
  useEffect(() => { try { localStorage.setItem("betting.bets", JSON.stringify(bets)); } catch {} }, [bets]);

  /* --------- Odds format helpers --------- */
  const implied = (price: number) =>
    format === "decimal" ? impliedFromDecimal(price) : impliedFromAmerican(price);

  /* --------- H2H best (keep book key + title) --------- */
  function bestH2H(event: Event) {
    const byName = new Map<string, { price: number; bookKey: string; bookTitle: string }>();
    for (const bk of event.bookmakers || []) {
      if (!selectedBooks[bk.key]) continue;
      const m = bk.markets.find((m) => m.key === "h2h");
      if (!m) continue;
      for (const o of m.outcomes) {
        const prev = byName.get(o.name);
        if (!prev || o.price > prev.price) {
          byName.set(o.name, { price: o.price, bookKey: bk.key, bookTitle: bk.title });
        }
      }
    }
    return Array.from(byName.entries()).map(([name, v]) => ({ name, ...v }));
  }

  /* --------- Add to slip --------- */
  function addSelection(ev: Event, bk: Bookmaker, mk: MarketKey, o: Outcome) {
    // convert to decimal if format is american
    const dec = format === "decimal" ? o.price : americanToDecimal(o.price);
    const match = ev.home_team && ev.away_team ? `${ev.home_team} vs ${ev.away_team}` : ev.id.slice(0, 8);
    const sel: BetSelection = {
      id: uid(),
      eventId: ev.id,
      match,
      sportKey: ev.sport_key,
      market: mk,
      outcome: o.name,
      point: o.point,
      price: dec,
      bookmakerKey: bk.key,
      bookmakerTitle: bk.title || bk.key,
      stake: 10, // default
      status: "pending",
    };
    setSlip((s) => [sel, ...s]);
  }
  function americanToDecimal(amer: number) {
    if (amer > 0) return 1 + amer / 100;
    return 1 + 100 / Math.abs(amer);
  }

  /* --------- Place slip -> bets --------- */
  function placeAll() {
    if (slip.length === 0) return;
    let need = 0;
    for (const s of slip) need += Math.max(0, s.stake || 0);
    if (need > bankroll) {
      alert("Not enough bankroll (simulated). Reduce stakes or add funds.");
      return;
    }
    const now = new Date().toISOString();
    setBankroll((b) => b - need);
    setBets((b) => [
      ...slip.map((s) => ({ ...s, status: "placed", placedAt: now })),
      ...b,
    ]);
    setSlip([]);
  }

  /* --------- Settlement (H2H only) --------- */
  useEffect(() => {
    // try settle placed bets when scores arrive / refresh changes
    const newly: BetSelection[] = [];
    const now = new Date().toISOString();
    let delta = 0;

    setBets((prev) => {
      const next = prev.map((bet) => {
        if (bet.status !== "placed") return bet;
        const sc = scores[bet.eventId];
        if (!sc || !sc.completed) return bet;

        if (bet.market !== "h2h") {
          // we only auto-settle H2H; others require line parsing
          return { ...bet, status: "push", settledAt: now, resultNote: "Not settled (non-H2H) — stake returned" };
        }

        const winner = h2hWinner(sc);
        if (!winner) {
          // unknown → push
          delta += bet.stake;
          return { ...bet, status: "push", settledAt: now, resultNote: "Push / undetermined" };
        }

        if (winner === bet.outcome) {
          // win
          const payout = bet.stake * bet.price;
          delta += payout;
          return { ...bet, status: "won", settledAt: now, resultNote: `Won @ ${bet.price}` };
        } else {
          // lose (stake already deducted at placement)
          return { ...bet, status: "lost", settledAt: now, resultNote: `Lost (winner: ${winner})` };
        }
      });
      // bankroll adjustments (credits on win / push)
      if (delta !== 0) setBankroll((b) => b + delta);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores]);

  function h2hWinner(sc: ScoreRow): string | null {
    if (!sc.completed || !Array.isArray(sc.scores) || sc.scores.length < 2) return null;
    const a = parseFloat(sc.scores[0]?.score || "0");
    const b = parseFloat(sc.scores[1]?.score || "0");
    const nA = sc.scores[0]?.name || "";
    const nB = sc.scores[1]?.name || "";
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    if (a > b) return nA;
    if (b > a) return nB;
    return "Draw";
  }

  /* --------- CSV export --------- */
  const exportCSV = () => {
    const headers = [
      "event_id","start_iso","start_local","match",
      "bookmaker_key","bookmaker_title","market","outcome","point","price"
    ];
    const lines: string[] = [headers.join(",")];

    for (const ev of events) {
      const date = new Date(ev.commence_time);
      const local = isFinite(date.getTime()) ? tzFmt.format(date) : ev.commence_time;
      const match = ev.home_team && ev.away_team ? `${ev.home_team} vs ${ev.away_team}` : ev.id.slice(0, 8);
      for (const bk of ev.bookmakers || []) {
        if (!selectedBooks[bk.key]) continue;
        const m = bk.markets.find((mm) => mm.key === market);
        if (!m) continue;
        for (const o of sortOutcomes(market, m.outcomes)) {
          lines.push([
            ev.id, ev.commence_time, local.replace(/,/g," "), match.replace(/,/g," "),
            bk.key, (bk.title||"").replace(/,/g," "), market, (o.name||"").replace(/,/g," "),
            o.point ?? "", o.price ?? ""
          ].join(","));
        }
      }
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `odds_${sport}_${market}_${regions}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  /* --------- UI helpers --------- */
  const td: React.CSSProperties = { padding: "8px 12px", verticalAlign: "top" };
  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e5e7eb",
    position: "sticky", top: 0, background: "#f8fafc"
  };

  const totalStakedOpen = bets.filter(b => b.status === "placed").reduce((s, b) => s + (b.stake||0), 0);
  const slipTotal = slip.reduce((s, b) => s + (b.stake||0), 0);

  return (
    <main style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" }}>
        <Link href="/" style={{ textDecoration: "none", fontSize: 13 }}>← Home</Link>
        <strong style={{ fontSize: 14 }}>Sports Odds — viewer + simulated bet slip</strong>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          Not a betting site. Odds shown for research. Slip is <b>simulated</b> play-money only.
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} />
            Mock data
          </label>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 12, padding: 12, overflow: "hidden" }}>
        {/* LEFT: Odds table & controls */}
        <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr", gap: 12, minWidth: 0 }}>
          {/* Error banner */}
          {error && (
            <div style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", padding: 10, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <a href="/api/odds/sports" target="_blank" rel="noreferrer" style={{ fontSize: 12, textDecoration: "underline" }}>
                  Open /api/odds/sports
                </a>
                <button onClick={fetchSports} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer" }}>Retry sports</button>
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#475569" }}>
              Sport / league<br />
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", minWidth: 260 }}
              >
                <option key="upcoming" value="upcoming">All (upcoming + live)</option>
                {sportsLoading && <option value="" disabled>Loading sports…</option>}
                {!sportsLoading && sports.length === 0 && <option value="" disabled>No sports (check API key)</option>}
                {sports.map((s, i) => (
                  <option key={`${s.key}-${i}`} value={s.key}>{s.title} — {s.group}</option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 12, color: "#475569" }}>
              Region<br />
              <select value={regions} onChange={(e) => setRegions(e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                {REGIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </label>

            <label style={{ fontSize: 12, color: "#475569" }}>
              Market<br />
              <select value={market} onChange={(e) => setMarket(e.target.value as MarketKey)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <option value="h2h">Match Winner (1x2 / Moneyline)</option>
                <option value="totals">Totals (Over/Under)</option>
                <option value="spreads">Spreads (Handicap)</option>
                <option value="outrights">Outrights (Futures)</option>
              </select>
            </label>

            <label style={{ fontSize: 12, color: "#475569" }}>
              Odds format<br />
              <select value={format} onChange={(e) => setFormat(e.target.value as any)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <option value="decimal">Decimal</option>
                <option value="american">American</option>
              </select>
            </label>

            <label style={{ fontSize: 12, color: "#475569" }}>
              Auto-refresh<br />
              <select value={autoRefreshSec} onChange={(e) => setAutoRefreshSec(Number(e.target.value))} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <option value={0}>Off</option>
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
              </select>
            </label>

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <button onClick={loadOdds} disabled={loading} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer" }}>
                {loading ? "Loading…" : "Refresh"}
              </button>
              <button onClick={exportCSV} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer" }}>
                Export CSV
              </button>
              <button
                onClick={() => setShowBookFilter((s) => !s)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: showBookFilter ? "#eef2ff" : "white", cursor: "pointer" }}
                title="Filter bookmakers"
              >
                Filter bookmakers
              </button>
            </div>

            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={showImplied} onChange={(e) => setShowImplied(e.target.checked)} />
              Show implied %
            </label>

            {lastUpdated && <span style={{ fontSize: 12, color: "#64748b" }}>Last updated: {lastUpdated}</span>}
          </div>

          {/* Bookmaker filter */}
          {showBookFilter && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#f8fafc" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {allBooks.map((b) => (
                  <label key={b.key} style={{ fontSize: 12, background: "white", border: "1px solid #e5e7eb", padding: "4px 8px", borderRadius: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!selectedBooks[b.key]}
                      onChange={(e) => setSelectedBooks((prev) => ({ ...prev, [b.key]: e.target.checked }))}
                      style={{ marginRight: 6 }}
                    />
                    {b.title || b.key}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Table */}
          <div style={{ overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10, minHeight: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th}>Start</th>
                  <th style={th}>Match</th>
                  <th style={th}>Live</th>
                  <th style={th}>Market</th>
                  <th style={th}>Best prices</th>
                  <th style={{ ...th, width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const date = new Date(ev.commence_time);
                  const start = isFinite(date.getTime()) ? tzFmt.format(date) : ev.commence_time;
                  const match = ev.home_team && ev.away_team ? `${ev.home_team} vs ${ev.away_team}` : ev.id.slice(0, 8);
                  const isPinned = !!pins[ev.id];

                  // Best cell (H2H aggregates). For other markets: preview first selected book.
                  let bestCell: JSX.Element = <span style={{ color: "#64748b" }}>No odds</span>;
                  let actionsCell: JSX.Element = <span style={{ color: "#94a3b8" }}>—</span>;

                  if (market === "h2h") {
                    const rows = bestH2H(ev);
                    if (rows.length) {
                      bestCell = (
                        <div style={{ display: "grid", gap: 4 }}>
                          {rows.map((r) => (
                            <div key={`${ev.id}-${r.name}`} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                              <span style={{ color: "#0f172a" }}>{r.name}</span>
                              <span style={{ color: "#334155" }}>
                                {r.price}{showImplied && fmtPct(implied(r.price))}
                                <span style={{ color: "#64748b" }}> ({r.bookTitle})</span>
                              </span>
                              <button
                                onClick={() => {
                                  const bk = ev.bookmakers.find(b => b.key === r.bookKey) || { key: r.bookKey, title: r.bookTitle, last_update: "", markets: [] };
                                  addSelection(ev, bk as Bookmaker, "h2h", { name: r.name, price: r.price });
                                }}
                                style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", cursor: "pointer" }}
                                title="Add to slip"
                              >
                                Add
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                      actionsCell = (
                        <button
                          onClick={() => setExpanded((s) => ({ ...s, [ev.id]: !s[ev.id] }))}
                          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer" }}
                        >
                          {expanded[ev.id] ? "Hide" : "Expand"}
                        </button>
                      );
                    }
                  } else {
                    const bk = (ev.bookmakers || []).find((b) => selectedBooks[b.key]);
                    const m = bk?.markets?.find((mm) => mm.key === market);
                    if (m?.outcomes?.length) {
                      const outs = sortOutcomes(market, m.outcomes);
                      bestCell = (
                        <div style={{ display: "grid", gap: 4 }}>
                          {outs.slice(0, 3).map((o, i) => (
                            <div key={`${ev.id}-${bk?.key || "bk"}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                              <span style={{ color: "#0f172a" }}>{o.name}{o.point != null ? ` ${o.point}` : ""}</span>
                              <span style={{ color: "#334155" }}>
                                {o.price}{showImplied && fmtPct(implied(o.price))}
                                <span style={{ color: "#64748b" }}> ({bk?.title})</span>
                              </span>
                              <button
                                onClick={() => bk && addSelection(ev, bk, market, o)}
                                style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", cursor: "pointer" }}
                                title="Add to slip"
                              >
                                Add
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                      actionsCell = (
                        <button
                          onClick={() => setExpanded((s) => ({ ...s, [ev.id]: !s[ev.id] }))}
                          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer" }}
                        >
                          {expanded[ev.id] ? "Hide" : "Expand"}
                        </button>
                      );
                    }
                  }

                  const sc = scores[ev.id];
                  const scoreText = sc?.scores?.length
                    ? sc.scores.map((s) => `${s.name} ${s.score}`).join("  ·  ")
                    : "—";

                  return (
                    <>
                      <tr key={ev.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                        <td style={td}>{start}</td>
                        <td style={td}>{match}</td>
                        <td style={td}>{scoreText}</td>
                        <td style={td}>{market.toUpperCase()}</td>
                        <td style={{ ...td, width: 420 }}>{bestCell}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {actionsCell}
                            <button
                              onClick={() => setPins((p) => ({ ...p, [ev.id]: !p[ev.id] }))}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                border: "1px solid #e5e7eb",
                                cursor: "pointer",
                                background: isPinned ? "#fff7ed" : "white",
                              }}
                              title="Pin"
                            >
                              {isPinned ? "★ Pinned" : "☆ Pin"}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {expanded[ev.id] && (
                        <tr key={`${ev.id}-expanded`}>
                          <td colSpan={6} style={{ padding: 0, background: "#f8fafc" }}>
                            <div style={{ padding: 10 }}>
                              <strong style={{ display: "block", marginBottom: 8 }}>
                                All bookmakers — {market.toUpperCase()}
                              </strong>
                              {(ev.bookmakers || [])
                                .filter((bk) => selectedBooks[bk.key])
                                .map((bk) => {
                                  const m = bk.markets.find((mm) => mm.key === market);
                                  if (!m) return null;
                                  const outs = sortOutcomes(market, m.outcomes);
                                  return (
                                    <div
                                      key={`${ev.id}-bk-${bk.key}`}
                                      style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "white", marginBottom: 8 }}
                                    >
                                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{bk.title}</div>
                                      <div style={{ display: "grid", gap: 6 }}>
                                        {outs.map((o, i) => (
                                          <div key={`${bk.key}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                                            <span>{o.name}{o.point != null ? ` ${o.point}` : ""}</span>
                                            <span>
                                              {o.price}{showImplied && fmtPct(implied(o.price))}
                                            </span>
                                            <button
                                              onClick={() => addSelection(ev, bk, market, o)}
                                              style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", cursor: "pointer" }}
                                              title="Add to slip"
                                            >
                                              Add
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {events.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} style={{ ...td, color: "#64748b" }}>
                      No events returned for this selection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: Simulated Bet Slip */}
        <aside style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, display: "grid", gridTemplateRows: "auto auto auto 1fr", gap: 10, minHeight: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <strong>Bet Slip (Simulated)</strong>
            <span style={{ fontSize: 12, color: "#64748b" }}>Bankroll: €{bankroll.toFixed(2)}</span>
          </div>

          {/* Pending selections */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#f8fafc" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>Pending selections</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>Total stake: €{slipTotal.toFixed(2)}</span>
            </div>
            {slip.length === 0 ? (
              <div style={{ fontSize: 12, color: "#64748b" }}>Click “Add” next to any price to put it here.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {slip.map((s) => (
                  <div key={s.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                    <div style={{ fontWeight: 600 }}>{s.match}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{s.market.toUpperCase()} • {s.bookmakerTitle}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span>{s.outcome}{s.point != null ? ` ${s.point}` : ""}</span>
                      <span>@ {s.price.toFixed(2)}{showImplied && fmtPct(impliedFromDecimal(s.price))}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                      <label style={{ fontSize: 12 }}>
                        Stake €
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={s.stake}
                          onChange={(e) => {
                            const v = Math.max(0, Number(e.target.value) || 0);
                            setSlip((arr) => arr.map((x) => (x.id === s.id ? { ...x, stake: v } : x)));
                          }}
                          style={{ marginLeft: 6, width: 80, padding: "4px 6px", borderRadius: 6, border: "1px solid #e5e7eb" }}
                        />
                      </label>
                      <button
                        onClick={() => setSlip((arr) => arr.filter((x) => x.id !== s.id))}
                        style={{ marginLeft: "auto", padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={placeAll}
                disabled={slip.length === 0}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", cursor: slip.length ? "pointer" : "not-allowed", background: slip.length ? "#ecfeff" : "#f8fafc" }}
              >
                Place {slip.length} bet{slip.length !== 1 ? "s" : ""} (−€{slipTotal.toFixed(2)})
              </button>
              <button
                onClick={() => setSlip([])}
                disabled={slip.length === 0}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: slip.length ? "pointer" : "not-allowed" }}
              >
                Clear slip
              </button>
            </div>
          </div>

          {/* Open bets / settled */}
          <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 6, minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 600 }}>Your bets</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>Open staked: €{totalStakedOpen.toFixed(2)}</span>
            </div>
            <div style={{ overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
              {bets.length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748b" }}>No bets yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {bets.map((b) => (
                    <div key={b.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <div style={{ fontWeight: 600 }}>{b.match}</div>
                        <span style={{
                          fontSize: 12,
                          color: b.status === "won" ? "#065f46" : b.status === "lost" ? "#7f1d1d" : b.status === "push" ? "#1f2937" : "#6b7280",
                          background: b.status === "won" ? "#ecfdf5" : b.status === "lost" ? "#fef2f2" : b.status === "push" ? "#f3f4f6" : "#f1f5f9",
                          padding: "2px 6px", borderRadius: 6, border: "1px solid #e5e7eb"
                        }}>
                          {b.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{b.market.toUpperCase()} • {b.bookmakerTitle}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span>{b.outcome}{b.point != null ? ` ${b.point}` : ""} @ {b.price.toFixed(2)}</span>
                        <span>Stake €{b.stake.toFixed(2)}</span>
                      </div>
                      {b.resultNote && <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{b.resultNote}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sim controls */}
          <div style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12 }}>
              Add funds €
              <input
                type="number"
                min={0}
                step={10}
                placeholder="100"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = Number((e.target as HTMLInputElement).value) || 0;
                    if (v > 0) setBankroll((b) => b + v);
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
                style={{ marginLeft: 6, width: 90, padding: "4px 6px", borderRadius: 6, border: "1px solid #e5e7eb" }}
              />
            </label>
            <button
              onClick={() => { setSlip([]); setBets([]); setBankroll(1000); }}
              style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}
              title="Reset simulation"
            >
              Reset simulation
            </button>
          </div>

          <div style={{ fontSize: 11, color: "#64748b" }}>
            This is a <b>simulation</b> built on top of a read-only odds feed. Real wagering requires licensed bookmaker
            integrations plus KYC/AML, age/geo checks, and responsible gambling protections.
          </div>
        </aside>
      </section>
    </main>
  );
}
