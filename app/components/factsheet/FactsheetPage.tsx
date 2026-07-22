'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Stock, GridKeyData } from '../../../types';
import { PEFactsheetSummary } from '../../../types/pe';
import { FactsheetInputs, FnoPosition, FnoOverlay } from '../../../types/factsheet';

interface NiftySmallcapData {
  lastPrice: number;
  dailyChange: number;
  weeklyChange: number;
  monthlyChange: number;
  yearlyChange: number;
  pe: number | null;
  lastUpdated: string;
}

interface FactsheetPageProps {
  stocks: Stock[];
  gridKeyData: GridKeyData[];
  portfolioHistory: { date: string; value: number }[];
  isAnalyst?: boolean;
}

// ---- enriched holding shape used for factsheet computations ----
interface Holding {
  name: string;
  sector: string;
  value: number;            // current market value (₹)
  weight: number;           // % of public sleeve
  return1M: number | null;
  return3M: number | null;
  return1Y: number | null;
}

// ---- formatters ----
const CR = 10000000;
const fmtCr = (v: number | null, dec = 1): string =>
  v == null ? '—' : `₹${(v / CR).toFixed(dec)}`;
const fmtPct = (v: number | null, dec = 1): string =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dec)}%`;
const fmtBps = (v: number | null): string =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${Math.round(v)}`;

// Dashboard-consistent portfolio return: de-annualize each holding's period
// return into a P&L contribution, then express as % of the prior-period value.
function pnlReturn(items: Holding[], key: 'return1M' | 'return3M' | 'return1Y'): number | null {
  let pnl = 0;
  let total = 0;
  items.forEach(it => {
    total += it.value;
    const r = it[key];
    if (r != null) pnl += (it.value * r) / (100 + r);
  });
  const prev = total - pnl;
  return prev > 0 ? (pnl / prev) * 100 : null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function FactsheetPage({ stocks, gridKeyData, portfolioHistory, isAnalyst = false }: FactsheetPageProps) {
  // Default reporting month = latest completed month is overkill; use current month.
  const [month, setMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [cashPosition, setCashPosition] = useState<number | null>(null);
  const [pmNote, setPmNote] = useState<string>('');
  const [fnoPositions, setFnoPositions] = useState<FnoPosition[]>([]);
  const [nifty, setNifty] = useState<NiftySmallcapData | null>(null);
  const [pe, setPe] = useState<PEFactsheetSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);

  // Load persisted inputs for the selected month
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/factsheet-inputs?month=${month}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: FactsheetInputs | null) => {
        if (cancelled || !data) return;
        setCashPosition(data.cashPosition ?? null);
        setPmNote(data.pmNote ?? '');
        setFnoPositions(Array.isArray(data.fnoPositions) ? data.fnoPositions : []);
        setSavedAt(data.updatedAt ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [month]);

  // Benchmark + PE aggregate (once)
  useEffect(() => {
    fetch('/api/nifty-smallcap').then(r => (r.ok ? r.json() : null)).then(d => d && setNifty(d)).catch(() => {});
    fetch('/api/pe/factsheet-summary').then(r => (r.ok ? r.json() : null)).then(d => d && setPe(d)).catch(() => {});
  }, []);

  // ---- Public equity enrichment ----
  const holdings = useMemo<Holding[]>(() => {
    const enriched = gridKeyData.map(item => {
      const s = stocks.find(stock => {
        if (item.nseCode && stock.nseCode) return item.nseCode.toLowerCase() === stock.nseCode.toLowerCase();
        if (item.bseCode && stock.bseCode) return item.bseCode.toLowerCase() === stock.bseCode.toLowerCase();
        return false;
      });
      const price = s?.currentPrice ?? null;
      const value = item.quantity && price ? item.quantity * price : 0;
      return {
        name: item.scripName,
        sector: s?.industryGroup || s?.industry || 'Other',
        value,
        return1M: s?.return1M ?? null,
        return3M: s?.return3M ?? null,
        return1Y: s?.return1Y ?? null,
      };
    }).filter(h => h.value > 0);

    const total = enriched.reduce((sum, h) => sum + h.value, 0);
    return enriched
      .map(h => ({ ...h, weight: total > 0 ? (h.value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [gridKeyData, stocks]);

  const publicValue = useMemo(() => holdings.reduce((s, h) => s + h.value, 0), [holdings]);

  // ---- Portfolio returns ----
  const returns = useMemo(() => {
    const monthly = pnlReturn(holdings, 'return1M');
    const quarterly = pnlReturn(holdings, 'return3M');
    const yearly = pnlReturn(holdings, 'return1Y');

    // YTD (financial year) from portfolio history snapshots
    let ytd: number | null = null;
    if (portfolioHistory.length >= 2) {
      const now = new Date();
      const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const fyStart = `${fyStartYear}-04-01`;
      const sorted = [...portfolioHistory].sort((a, b) => a.date.localeCompare(b.date));
      const start = sorted.find(h => h.date >= fyStart) || sorted[0];
      const latest = sorted[sorted.length - 1];
      if (start && latest && start.date !== latest.date && start.value > 0) {
        ytd = ((latest.value - start.value) / start.value) * 100;
      }
    }
    return { monthly, quarterly, yearly, ytd };
  }, [holdings, portfolioHistory]);

  // ---- Sector exposure ----
  const sectors = useMemo(() => {
    const map: Record<string, number> = {};
    holdings.forEach(h => { map[h.sector] = (map[h.sector] || 0) + h.weight; });
    return Object.entries(map)
      .map(([name, weight]) => ({ name, weight }))
      .sort((a, b) => b.weight - a.weight);
  }, [holdings]);

  // ---- Top movers (monthly contribution) ----
  const movers = useMemo(() => {
    const withContrib = holdings
      .filter(h => h.return1M != null)
      .map(h => ({
        name: h.name,
        ret: h.return1M as number,
        contribBps: (h.weight / 100) * (h.return1M as number) * 100,
      }));
    const contributors = [...withContrib].filter(m => m.contribBps > 0)
      .sort((a, b) => b.contribBps - a.contribBps).slice(0, 4);
    const detractors = [...withContrib].filter(m => m.contribBps < 0)
      .sort((a, b) => a.contribBps - b.contribBps).slice(0, 4);
    return { contributors, detractors };
  }, [holdings]);

  // ---- Rank distribution bands ----
  const bands = useMemo(() => {
    const defs: { label: string; from: number; to: number }[] = [
      { label: '1 – 10', from: 0, to: 10 },
      { label: '11 – 20', from: 10, to: 20 },
      { label: '21 – 30', from: 20, to: 30 },
      { label: '31 – 50', from: 30, to: 50 },
      { label: '51+', from: 50, to: holdings.length },
    ];
    return defs
      .map(d => {
        const slice = holdings.slice(d.from, d.to);
        if (slice.length === 0) return null;
        const weight = slice.reduce((s, h) => s + h.weight, 0);
        return {
          label: d.label,
          count: slice.length,
          weight,
          monthly: pnlReturn(slice, 'return1M'),
          yearly: pnlReturn(slice, 'return1Y'),
        };
      })
      .filter(Boolean) as { label: string; count: number; weight: number; monthly: number | null; yearly: number | null }[];
  }, [holdings]);

  const cumWeight = useMemo(() => {
    const cum = (n: number) => holdings.slice(0, n).reduce((s, h) => s + h.weight, 0);
    return { top10: cum(10), top25: cum(25), top50: cum(50) };
  }, [holdings]);

  // ---- F&O overlay ----
  const fno: FnoOverlay = useMemo(() => {
    let realised = 0, unrealised = 0, gross = 0, hedge = 0, directional = 0;
    fnoPositions.forEach(p => {
      const entry = p.entryValue ?? 0;
      gross += Math.abs(entry);
      if (p.status === 'exited' && p.exitValue != null) realised += p.exitValue - entry;
      if (p.status === 'held' && p.currentValue != null) unrealised += p.currentValue - entry;
      if (p.bookType === 'hedge') hedge += Math.abs(entry);
      else if (p.bookType === 'directional') directional += Math.abs(entry);
    });
    const classified = hedge + directional;
    return {
      realisedPnl: realised,
      unrealisedPnl: unrealised,
      combinedPnl: realised + unrealised,
      grossNotional: gross,
      hedgePct: classified > 0 ? (hedge / classified) * 100 : null,
      directionalPct: classified > 0 ? (directional / classified) * 100 : null,
    };
  }, [fnoPositions]);

  // ---- AUM & allocation ----
  const peNav = pe?.currentNav ?? 0;
  const cash = cashPosition ?? 0;
  const aum = publicValue + peNav + cash;
  const alloc = {
    publicPct: aum > 0 ? (publicValue / aum) * 100 : 0,
    privatePct: aum > 0 ? (peNav / aum) * 100 : 0,
    cashPct: aum > 0 ? (cash / aum) * 100 : 0,
  };
  const liquidity = {
    dailyLiquid: alloc.publicPct,
    cash: alloc.cashPct,
    illiquidLt3: aum > 0 && pe ? (pe.liquidity.lt3yr / aum) * 100 : 0,
    illiquidGt3: aum > 0 && pe ? ((pe.liquidity.gt3yr + pe.liquidity.unclassified) / aum) * 100 : 0,
  };

  // ---- Public NAV chart (trailing 12 months) ----
  const navChart = useMemo(() => {
    if (portfolioHistory.length < 2) return null;
    const sorted = [...portfolioHistory].sort((a, b) => a.date.localeCompare(b.date));
    const latest = new Date(sorted[sorted.length - 1].date);
    const cutoff = new Date(latest);
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const series = sorted.filter(h => h.date >= cutoffStr);
    if (series.length < 2) return null;
    const values = series.map(s => s.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const W = 700, H = 110, pad = 8;
    const x = (i: number) => pad + (i / (series.length - 1)) * (W - 2 * pad);
    const y = (v: number) => pad + (1 - (v - min) / range) * (H - 2 * pad);
    const line = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ');
    const area = `${line} L${x(series.length - 1).toFixed(1)},${H - pad} L${pad},${H - pad} Z`;
    const change = ((values[values.length - 1] - values[0]) / values[0]) * 100;
    // ~monthly tick labels
    const ticks: string[] = [];
    const step = Math.max(1, Math.floor(series.length / 12));
    for (let i = 0; i < series.length; i += step) ticks.push(MONTH_NAMES[new Date(series[i].date).getMonth()]);
    return { line, area, change, ticks, W, H, lastX: x(series.length - 1), lastY: y(values[values.length - 1]) };
  }, [portfolioHistory]);

  // ---- persistence ----
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/factsheet-inputs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, cashPosition, pmNote, fnoPositions }),
      });
      if (res.ok) {
        const data = await res.json();
        setSavedAt(data?.updatedAt ?? new Date().toISOString());
      }
    } finally {
      setSaving(false);
    }
  }, [month, cashPosition, pmNote, fnoPositions]);

  const addFno = () => setFnoPositions(prev => [...prev, {
    id: `${Date.now()}-${prev.length}`,
    instrument: '', bookType: 'directional', status: 'held',
    entryValue: null, exitValue: null, currentValue: null, notes: null,
  }]);
  const updateFno = (id: string, patch: Partial<FnoPosition>) =>
    setFnoPositions(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const removeFno = (id: string) => setFnoPositions(prev => prev.filter(p => p.id !== id));

  // Human-readable month label
  const [yy, mm] = month.split('-').map(Number);
  const monthLabel = `${MONTH_NAMES[(mm || 1) - 1]} ${yy}`;
  const asOf = (() => {
    const last = new Date(yy, mm, 0); // last day of month
    return `${String(last.getDate()).padStart(2, '0')} ${MONTH_NAMES[(mm || 1) - 1]} ${yy}`;
  })();

  if (isAnalyst) {
    return <div style={{ padding: 40, color: 'var(--text-secondary, #666)' }}>
      The monthly factsheet contains portfolio-level values and is available to portfolio managers only.
    </div>;
  }

  const top10 = holdings.slice(0, 10);
  const remainingWeight = holdings.slice(10).reduce((s, h) => s + h.weight, 0);
  const remainingCount = Math.max(0, holdings.length - 10);

  // navy palette from mock
  const NAVY = '#16294d', GREEN = '#14663f', RED = '#9b2c33', GREY = '#6b7078', LINE = '#dcdad3';
  const rc = (v: number | null) => (v == null ? GREY : v >= 0 ? GREEN : RED); // return color

  return (
    <div className="factsheet-wrapper">
      <style>{`
        @media print {
          nav, .main-nav, .factsheet-controls { display: none !important; }
          @page { size: A4; margin: 0; }
          body { background: #fff !important; }
          .factsheet-page { box-shadow: none !important; margin: 0 auto !important; page-break-after: always; }
        }
        .factsheet-page { width: 210mm; min-height: 297mm; margin: 0 auto 20px; background: #fff;
          color: #1e2229; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; line-height: 1.35;
          box-shadow: 0 2px 14px rgba(0,0,0,0.15); box-sizing: border-box; padding: 34px 40px 26px;
          display: flex; flex-direction: column; gap: 14px; }
        .fs-h { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; color: ${NAVY}; }
        .factsheet-controls { max-width: 210mm; margin: 0 auto 18px; padding: 16px 20px; background: var(--card-bg, #fff);
          border: 1px solid var(--border-color, #e2e2e2); border-radius: 10px; }
        .fs-ctrl-row { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; margin-bottom: 14px; }
        .fs-ctrl-row label { display: block; font-size: 12px; color: var(--text-secondary, #666); margin-bottom: 4px; font-weight: 600; }
        .fs-ctrl-row input, .fs-ctrl-row textarea, .fs-fno input, .fs-fno select {
          padding: 7px 9px; border: 1px solid var(--border-color, #ccc); border-radius: 6px; font-size: 13px;
          background: var(--input-bg, #fff); color: var(--text-primary, #111); }
        .fs-btn { padding: 8px 16px; border-radius: 6px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; }
        .fs-btn-primary { background: ${NAVY}; color: #fff; }
        .fs-btn-secondary { background: var(--border-color, #e2e2e2); color: var(--text-primary, #111); }
        .fs-fno-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
        .fs-fno-table th, .fs-fno-table td { padding: 5px 6px; text-align: left; border-bottom: 1px solid var(--border-color, #eee); }
        .fs-fno input { width: 100%; box-sizing: border-box; }
      `}</style>

      {/* ================= CONTROLS (screen only) ================= */}
      {showControls && (
        <div className="factsheet-controls">
          <div className="fs-ctrl-row">
            <div>
              <label>Reporting month</label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            </div>
            <div>
              <label>Cash &amp; liquid position (₹)</label>
              <input type="number" placeholder="optional" value={cashPosition ?? ''}
                onChange={e => setCashPosition(e.target.value === '' ? null : parseFloat(e.target.value))}
                style={{ width: 180 }} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label>Portfolio manager's note</label>
              <textarea value={pmNote} onChange={e => setPmNote(e.target.value)} rows={2}
                placeholder="Commentary for this month…" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary,#666)' }}>
              F&amp;O positions (derivatives overlay)
            </label>
            <table className="fs-fno-table fs-fno">
              <thead>
                <tr>
                  <th>Instrument</th><th>Book</th><th>Status</th>
                  <th>Entry ₹</th><th>Exit ₹</th><th>Current ₹</th><th></th>
                </tr>
              </thead>
              <tbody>
                {fnoPositions.map(p => (
                  <tr key={p.id}>
                    <td><input value={p.instrument} onChange={e => updateFno(p.id, { instrument: e.target.value })} placeholder="NIFTY 24000 CE" /></td>
                    <td>
                      <select value={p.bookType ?? ''} onChange={e => updateFno(p.id, { bookType: (e.target.value || null) as any })}>
                        <option value="hedge">Hedge</option>
                        <option value="directional">Directional</option>
                      </select>
                    </td>
                    <td>
                      <select value={p.status} onChange={e => updateFno(p.id, { status: e.target.value as any })}>
                        <option value="held">Held</option>
                        <option value="exited">Exited</option>
                      </select>
                    </td>
                    <td><input type="number" value={p.entryValue ?? ''} onChange={e => updateFno(p.id, { entryValue: e.target.value === '' ? null : parseFloat(e.target.value) })} /></td>
                    <td><input type="number" value={p.exitValue ?? ''} disabled={p.status !== 'exited'} onChange={e => updateFno(p.id, { exitValue: e.target.value === '' ? null : parseFloat(e.target.value) })} /></td>
                    <td><input type="number" value={p.currentValue ?? ''} disabled={p.status !== 'held'} onChange={e => updateFno(p.id, { currentValue: e.target.value === '' ? null : parseFloat(e.target.value) })} /></td>
                    <td><button className="fs-btn fs-btn-secondary" onClick={() => removeFno(p.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="fs-btn fs-btn-secondary" style={{ marginTop: 8 }} onClick={addFno}>+ Add position</button>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
            <button className="fs-btn fs-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save inputs'}</button>
            <button className="fs-btn fs-btn-secondary" onClick={() => window.print()}>Print / PDF</button>
            <button className="fs-btn fs-btn-secondary" onClick={() => setShowControls(false)}>Hide controls</button>
            {savedAt && <span style={{ fontSize: 12, color: 'var(--text-secondary,#888)' }}>Saved {new Date(savedAt).toLocaleString()}</span>}
          </div>
        </div>
      )}
      {!showControls && (
        <div className="factsheet-controls" style={{ textAlign: 'right' }}>
          <button className="fs-btn fs-btn-secondary" onClick={() => setShowControls(true)}>Show controls</button>
          <button className="fs-btn fs-btn-secondary" style={{ marginLeft: 8 }} onClick={() => window.print()}>Print / PDF</button>
        </div>
      )}

      {/* ================= PAGE 1 ================= */}
      <section className="factsheet-page">
        {/* masthead */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${NAVY}`, paddingBottom: 12 }}>
          <div>
            <div className="fs-h" style={{ fontSize: 22, letterSpacing: 0.2 }}>Sagun Family Office</div>
            <div style={{ fontSize: 11, color: GREY, marginTop: 3, letterSpacing: 0.4 }}>Consolidated Portfolio · Monthly Investment Factsheet</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="fs-h" style={{ fontSize: 15 }}>{monthLabel}</div>
            <div style={{ fontSize: 9.5, color: GREY, marginTop: 2 }}>As of {asOf} · INR</div>
            <div style={{ display: 'inline-block', marginTop: 6, fontSize: 8, fontWeight: 700, letterSpacing: 1.2, color: RED, border: `1px solid ${RED}`, padding: '2px 7px', borderRadius: 2 }}>STRICTLY CONFIDENTIAL</div>
          </div>
        </header>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 1, background: LINE, border: `1px solid ${LINE}` }}>
          <div style={{ background: NAVY, color: '#fff', padding: '11px 13px' }}>
            <div style={{ fontSize: 8.5, letterSpacing: 0.8, color: '#aab6cc', textTransform: 'uppercase' }}>Total AUM</div>
            <div className="fs-h" style={{ fontSize: 23, color: '#fff', marginTop: 2 }}>{fmtCr(aum)}<span style={{ fontSize: 12, fontWeight: 400, color: '#c4cddd' }}> cr</span></div>
          </div>
          {([['Monthly', returns.monthly], ['Quarterly', returns.quarterly], ['Yearly', returns.yearly], ['YTD', returns.ytd]] as [string, number | null][]).map(([label, val]) => (
            <div key={label} style={{ background: '#fff', padding: '11px 12px' }}>
              <div style={{ fontSize: 8.5, letterSpacing: 0.6, color: GREY, textTransform: 'uppercase' }}>{label}</div>
              <div className="fs-h" style={{ fontSize: 18, color: rc(val), marginTop: 2 }}>{fmtPct(val)}</div>
            </div>
          ))}
        </div>

        {/* two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 20 }}>
          {/* LEFT: performance vs benchmark + private sleeve */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="fs-h" style={{ fontSize: 12, borderBottom: `1px solid ${NAVY}`, paddingBottom: 3 }}>Public Sleeve — Return vs Benchmark</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 10.5 }}>
              <thead>
                <tr style={{ color: GREY, fontSize: 8.5, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', padding: '4px 0' }}></th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Monthly</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Quarterly</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Yearly</th>
                  <th style={{ padding: '4px 0', textAlign: 'right' }}>YTD</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: `1px solid ${LINE}` }}>
                  <td style={{ padding: '6px 0', fontWeight: 600 }}>Portfolio (public)</td>
                  <td style={{ textAlign: 'right', padding: '6px 6px', color: rc(returns.monthly), fontWeight: 600 }}>{fmtPct(returns.monthly)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 6px', color: rc(returns.quarterly), fontWeight: 600 }}>{fmtPct(returns.quarterly)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 6px', color: rc(returns.yearly), fontWeight: 600 }}>{fmtPct(returns.yearly)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 0', color: rc(returns.ytd), fontWeight: 600 }}>{fmtPct(returns.ytd)}</td>
                </tr>
                <tr style={{ borderTop: `1px solid ${LINE}`, color: '#4a4f57' }}>
                  <td style={{ padding: '6px 0' }}>Nifty Smallcap 100</td>
                  <td style={{ textAlign: 'right', padding: '6px 6px' }}>{fmtPct(nifty?.monthlyChange ?? null)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 6px' }}>—</td>
                  <td style={{ textAlign: 'right', padding: '6px 6px' }}>{fmtPct(nifty?.yearlyChange ?? null)}</td>
                  <td style={{ textAlign: 'right', padding: '6px 0' }}>—</td>
                </tr>
                <tr style={{ borderTop: `1px solid ${NAVY}`, background: '#f6f5f1' }}>
                  <td style={{ padding: '6px 5px', fontWeight: 600 }}>Active (bps)</td>
                  <td style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 600 }}>{nifty && returns.monthly != null ? fmtBps((returns.monthly - nifty.monthlyChange) * 100) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 600 }}>—</td>
                  <td style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 600 }}>{nifty && returns.yearly != null ? fmtBps((returns.yearly - nifty.yearlyChange) * 100) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '6px 5px', fontWeight: 600 }}>—</td>
                </tr>
              </tbody>
            </table>

            <div className="fs-h" style={{ fontSize: 12, borderBottom: `1px solid ${NAVY}`, paddingBottom: 3, marginTop: 2 }}>Private Sleeve — Since Inception</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: LINE, border: `1px solid ${LINE}`, fontVariantNumeric: 'tabular-nums' }}>
              {([['Net IRR', pe?.irr != null ? `${pe.irr.toFixed(1)}%` : '—'],
                 ['MOIC', pe?.moic != null ? `${pe.moic.toFixed(2)}×` : '—'],
                 ['DPI', pe?.dpi != null ? `${pe.dpi.toFixed(2)}×` : '—'],
                 ['TVPI', pe?.tvpi != null ? `${pe.tvpi.toFixed(2)}×` : '—']] as [string, string][]).map(([l, v]) => (
                <div key={l} style={{ background: '#fff', padding: '8px 9px' }}>
                  <div style={{ fontSize: 8, color: GREY, letterSpacing: 0.4, textTransform: 'uppercase' }}>{l}</div>
                  <div className="fs-h" style={{ fontSize: 16, marginTop: 1 }}>{v}</div>
                </div>
              ))}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 10, color: '#4a4f57' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 0' }}>Paid-in</td>
                  <td style={{ textAlign: 'right', padding: '3px 0', fontWeight: 600, color: '#1e2229' }}>{fmtCr(pe?.paidIn ?? null)} cr</td>
                  <td style={{ padding: '3px 0 3px 18px' }}>Current NAV</td>
                  <td style={{ textAlign: 'right', padding: '3px 0', fontWeight: 600, color: '#1e2229' }}>{fmtCr(pe?.currentNav ?? null)} cr</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 0' }}>Distributed</td>
                  <td style={{ textAlign: 'right', padding: '3px 0', fontWeight: 600, color: '#1e2229' }}>{fmtCr(pe?.distributed ?? null)} cr</td>
                  <td style={{ padding: '3px 0 3px 18px' }}>Positions</td>
                  <td style={{ textAlign: 'right', padding: '3px 0', fontWeight: 600, color: '#1e2229' }}>{pe ? `${pe.heldCount} held · ${pe.exitedCount} exited` : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* RIGHT: allocation + liquidity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="fs-h" style={{ fontSize: 12, borderBottom: `1px solid ${NAVY}`, paddingBottom: 3 }}>Asset Allocation</div>
            <div style={{ display: 'flex', height: 15, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${alloc.publicPct}%`, background: NAVY }} />
              <div style={{ width: `${alloc.privatePct}%`, background: '#5a7bb0' }} />
              <div style={{ width: `${alloc.cashPct}%`, background: '#c7ccc0' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontVariantNumeric: 'tabular-nums' }}>
              {([['Public Equities', NAVY, publicValue, alloc.publicPct],
                 ['Private Equities', '#5a7bb0', peNav, alloc.privatePct],
                 ['Cash & Liquid', '#c7ccc0', cash, alloc.cashPct]] as [string, string, number, number][]).map(([l, c, v, p]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 9, height: 9, background: c, flex: 'none', borderRadius: 1 }} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{l}</span>
                  <span style={{ color: GREY }}>{fmtCr(v)} cr</span>
                  <span style={{ width: 42, textAlign: 'right', fontWeight: 700, color: NAVY }}>{p.toFixed(1)}%</span>
                </div>
              ))}
            </div>

            <div className="fs-h" style={{ fontSize: 12, borderBottom: `1px solid ${NAVY}`, paddingBottom: 3, marginTop: 4 }}>Liquidity Profile</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontVariantNumeric: 'tabular-nums', fontSize: 10 }}>
              {([['Daily liquid (listed)', liquidity.dailyLiquid], ['Cash & equivalents', liquidity.cash],
                 ['Illiquid · exit < 3 yr', liquidity.illiquidLt3], ['Illiquid · exit > 3 yr', liquidity.illiquidGt3]] as [string, number][]).map(([l, p]) => (
                <div key={l}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>{l}</span><span style={{ fontWeight: 700 }}>{p.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 5, background: '#eeece5', borderRadius: 3 }}>
                    <div style={{ width: `${Math.min(100, p)}%`, height: 5, background: NAVY, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* NAV chart */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${NAVY}`, paddingBottom: 3 }}>
            <span className="fs-h" style={{ fontSize: 12 }}>Public Sleeve NAV — Trailing 12 Months</span>
            <span style={{ fontSize: 8.5, color: GREY, fontVariantNumeric: 'tabular-nums' }}>
              {navChart ? `₹ cr · ${fmtPct(navChart.change)} over period` : 'insufficient history'}
            </span>
          </div>
          {navChart ? (
            <svg viewBox={`0 0 ${navChart.W} ${navChart.H}`} preserveAspectRatio="none" style={{ width: '100%', height: 118, display: 'block', marginTop: 6 }}>
              <path d={navChart.area} fill={NAVY} fillOpacity={0.07} />
              <path d={navChart.line} fill="none" stroke={NAVY} strokeWidth={2} />
              <circle cx={navChart.lastX} cy={navChart.lastY} r={3.5} fill={NAVY} />
            </svg>
          ) : (
            <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GREY, fontSize: 10 }}>
              Not enough portfolio history snapshots to plot 12 months.
            </div>
          )}
          {navChart && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7.5, color: '#8b8f96', marginTop: 1, padding: '0 4px' }}>
              {navChart.ticks.map((t, i) => <span key={i}>{t}</span>)}
            </div>
          )}
        </div>

        {/* top movers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {([['Top Contributors — Monthly', GREEN, movers.contributors],
             ['Top Detractors — Monthly', RED, movers.detractors]] as [string, string, typeof movers.contributors][]).map(([title, color, rows]) => (
            <div key={title}>
              <div className="fs-h" style={{ fontSize: 12, color, borderBottom: `1px solid ${color}`, paddingBottom: 3 }}>{title}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 9.5, marginTop: 5 }}>
                <thead>
                  <tr style={{ fontSize: 7.5, color: '#8b8f96', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    <th style={{ textAlign: 'left', fontWeight: 600 }}>Holding</th>
                    <th style={{ textAlign: 'right', fontWeight: 600 }}>Return</th>
                    <th style={{ textAlign: 'right', fontWeight: 600 }}>Contrib.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={3} style={{ padding: '4px 0', color: GREY }}>—</td></tr>}
                  {rows.map(m => (
                    <tr key={m.name} style={{ borderTop: '1px solid #eeece5' }}>
                      <td style={{ padding: '3.5px 0', fontWeight: 600 }}>{m.name}</td>
                      <td style={{ textAlign: 'right', color, fontWeight: 600 }}>{fmtPct(m.ret)}</td>
                      <td style={{ textAlign: 'right', color: GREY }}>{fmtBps(m.contribBps)} bps</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* PM note */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="fs-h" style={{ fontSize: 12, borderBottom: `1px solid ${NAVY}`, paddingBottom: 3, marginBottom: 8 }}>Portfolio Manager's Note</div>
          <div style={{ fontSize: 10.5, lineHeight: 1.5, color: '#2b2f36', textAlign: 'justify', whiteSpace: 'pre-wrap' }}>
            {pmNote?.trim() ? pmNote : <span style={{ color: GREY }}>No note recorded for {monthLabel}.</span>}
          </div>
        </div>

        <footer style={{ borderTop: `1px solid ${LINE}`, paddingTop: 7, marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#8b8f96' }}>
          <span>Strictly confidential — prepared for the Investment Committee. Not for external distribution.</span>
          <span>Page 1 of 2</span>
        </footer>
      </section>

      {/* ================= PAGE 2 ================= */}
      <section className="factsheet-page">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `2px solid ${NAVY}`, paddingBottom: 8 }}>
          <div className="fs-h" style={{ fontSize: 14 }}>Holdings &amp; Exposure</div>
          <div style={{ fontSize: 9.5, color: GREY }}>Sagun Family Office · {monthLabel} · As of {asOf}</div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 22 }}>
          {/* LEFT: top 10 + rank distribution */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${NAVY}`, paddingBottom: 3 }}>
                <span className="fs-h" style={{ fontSize: 12 }}>Public Book — Top 10</span>
                <span style={{ fontSize: 8, color: GREY }}>% of public sleeve</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 10, marginTop: 5 }}>
                <tbody>
                  {top10.map((h, i) => (
                    <tr key={h.name} style={{ borderBottom: '1px solid #eeece5' }}>
                      <td style={{ padding: '4.5px 0', color: '#9aa0a8', width: 16 }}>{i + 1}</td>
                      <td style={{ padding: '4.5px 0', fontWeight: 600 }}>{h.name}</td>
                      <td style={{ padding: '4.5px 0', color: GREY }}>{h.sector}</td>
                      <td style={{ textAlign: 'right', padding: '4.5px 0', fontWeight: 600 }}>{h.weight.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {remainingCount > 0 && (
                    <tr style={{ borderTop: `1px solid ${NAVY}`, background: '#f6f5f1' }}>
                      <td></td>
                      <td style={{ padding: '5px 0', fontWeight: 700 }} colSpan={2}>Remaining {remainingCount} holdings</td>
                      <td style={{ textAlign: 'right', padding: '5px 0', fontWeight: 700 }}>{remainingWeight.toFixed(1)}%</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${NAVY}`, paddingBottom: 3 }}>
                <span className="fs-h" style={{ fontSize: 12 }}>Distribution by Rank</span>
                <span style={{ fontSize: 8, color: GREY }}>weight &amp; return</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 9.5, marginTop: 5 }}>
                <thead>
                  <tr style={{ fontSize: 7.5, color: '#8b8f96', letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', fontWeight: 600 }}>Rank band</th>
                    <th style={{ fontWeight: 600 }}>Names</th>
                    <th style={{ fontWeight: 600 }}>Weight</th>
                    <th style={{ fontWeight: 600 }}>Monthly</th>
                    <th style={{ fontWeight: 600 }}>Yearly</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map(b => (
                    <tr key={b.label} style={{ borderTop: '1px solid #eeece5' }}>
                      <td style={{ padding: '4px 0', fontWeight: 600 }}>{b.label}</td>
                      <td style={{ textAlign: 'right', color: GREY }}>{b.count}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{b.weight.toFixed(1)}%</td>
                      <td style={{ textAlign: 'right', color: rc(b.monthly) }}>{fmtPct(b.monthly)}</td>
                      <td style={{ textAlign: 'right', color: rc(b.yearly) }}>{fmtPct(b.yearly)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `1px solid ${NAVY}`, background: '#f6f5f1' }}>
                    <td style={{ padding: '4.5px 0', fontWeight: 700 }}>Total</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{holdings.length}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>100.0%</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: rc(returns.monthly) }}>{fmtPct(returns.monthly)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: rc(returns.yearly) }}>{fmtPct(returns.yearly)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 8, color: GREY, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                Cumulative weight — Top 10 <b style={{ color: NAVY }}>{cumWeight.top10.toFixed(1)}%</b> · Top 25 <b style={{ color: NAVY }}>{cumWeight.top25.toFixed(1)}%</b> · Top 50 <b style={{ color: NAVY }}>{cumWeight.top50.toFixed(1)}%</b>
              </div>
            </div>
          </div>

          {/* RIGHT: sector exposure + private book */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="fs-h" style={{ fontSize: 12, borderBottom: `1px solid ${NAVY}`, paddingBottom: 3 }}>Public Sector Exposure</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5.5, fontVariantNumeric: 'tabular-nums', fontSize: 9.5, marginTop: 7 }}>
                {sectors.slice(0, 8).map(s => {
                  const maxW = sectors[0]?.weight || 1;
                  return (
                    <div key={s.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>{s.name}</span><span style={{ fontWeight: 700 }}>{s.weight.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 5, background: '#eeece5' }}>
                        <div style={{ width: `${(s.weight / maxW) * 100}%`, height: 5, background: NAVY }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${NAVY}`, paddingBottom: 3 }}>
                <span className="fs-h" style={{ fontSize: 12 }}>Private Book — Top 5</span>
                <span style={{ fontSize: 8, color: GREY }}>by NAV</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 9.5, marginTop: 5 }}>
                <tbody>
                  {(pe?.topHoldings ?? []).map(h => (
                    <tr key={h.companyName} style={{ borderBottom: '1px solid #eeece5' }}>
                      <td style={{ padding: '4px 0', fontWeight: 600 }}>{h.companyName}{h.sector ? <span style={{ color: GREY, fontWeight: 400 }}> · {h.sector}</span> : null}</td>
                      <td style={{ textAlign: 'right', padding: '4px 0', color: GREY }}>{fmtCr(h.currentValue)} cr</td>
                      <td style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600, width: 44 }}>{h.navPctOfSleeve != null ? `${h.navPctOfSleeve.toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                  {(!pe || pe.topHoldings.length === 0) && <tr><td style={{ padding: '4px 0', color: GREY }}>No private holdings</td></tr>}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 9, color: '#4a4f57', fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, color: GREY, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 3 }}>By Stage (NAV)</div>
                  Early (Seed–A) <b>{pe ? `${pe.byStage.early.toFixed(0)}%` : '—'}</b><br />
                  Growth (B–C) <b>{pe ? `${pe.byStage.growth.toFixed(0)}%` : '—'}</b><br />
                  Late (D+) <b>{pe ? `${pe.byStage.late.toFixed(0)}%` : '—'}</b>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, color: GREY, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 3 }}>Vintage (NAV)</div>
                  {pe && pe.byVintage.length > 0
                    ? pe.byVintage.slice(0, 4).map(v => <React.Fragment key={v.label}>{v.label} <b>{v.pct.toFixed(0)}%</b><br /></React.Fragment>)
                    : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* F&O overlay */}
        <div style={{ border: `1px solid ${NAVY}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, background: NAVY, color: '#fff', padding: '6px 12px' }}>
            <span className="fs-h" style={{ fontSize: 12, color: '#fff' }}>Derivatives (F&amp;O) Overlay</span>
            <span style={{ fontSize: 8, color: '#aab6cc' }}>Manually entered · reported separately from cash-equity returns</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: LINE, fontVariantNumeric: 'tabular-nums' }}>
            {([['Realised P&L', fno.realisedPnl, true], ['Unrealised MTM', fno.unrealisedPnl, true],
               ['Combined P&L', fno.combinedPnl, true], ['Gross Notional', fno.grossNotional, false]] as [string, number, boolean][]).map(([l, v, signed]) => (
              <div key={l} style={{ background: '#fff', padding: '9px 10px' }}>
                <div style={{ fontSize: 7.5, color: GREY, letterSpacing: 0.3, textTransform: 'uppercase' }}>{l}</div>
                <div className="fs-h" style={{ fontSize: 15, marginTop: 2, color: signed ? rc(v) : NAVY }}>
                  {signed && v >= 0 ? '+' : ''}{fmtCr(v)} cr
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderTop: `1px solid ${LINE}`, fontSize: 8.5, color: '#4a4f57', fontVariantNumeric: 'tabular-nums' }}>
            <span>Book split — Hedging / protective <b style={{ color: NAVY }}>{fno.hedgePct != null ? `${fno.hedgePct.toFixed(0)}%` : '—'}</b> · Directional <b style={{ color: NAVY }}>{fno.directionalPct != null ? `${fno.directionalPct.toFixed(0)}%` : '—'}</b></span>
            <span>{fnoPositions.length} position{fnoPositions.length === 1 ? '' : 's'}{aum > 0 ? ` · ${fmtPct((fno.combinedPnl / aum) * 100)} of AUM` : ''}</span>
          </div>
        </div>

        {/* methodology */}
        <div style={{ border: `1px solid ${LINE}`, background: '#faf9f5', padding: '9px 12px' }}>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: NAVY, marginBottom: 4 }}>Valuation &amp; Methodology</div>
          <div style={{ fontSize: 8.5, lineHeight: 1.45, color: '#4a4f57' }}>
            Public securities marked at last available close. Portfolio Monthly / Quarterly / Yearly are value-weighted trailing returns from holding-level data; YTD is measured from the start of the financial year using recorded portfolio snapshots. Benchmark is the Nifty Smallcap 100 (price return); quarterly and YTD benchmark figures are not published by the source and are shown as “—”. Private valuations follow latest marks — funds at manager NAV, direct positions at last priced round; IRR is money-weighted across positions with a recorded investment date, MOIC/DPI/TVPI computed against paid-in capital with full exits treated as distributions. F&amp;O figures are entered manually and reported separately from cash-equity returns.
          </div>
        </div>

        <footer style={{ borderTop: `1px solid ${LINE}`, paddingTop: 7, marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#8b8f96' }}>
          <span>Strictly confidential — prepared for the Investment Committee. Past performance is not indicative of future results.</span>
          <span>Page 2 of 2</span>
        </footer>
      </section>
    </div>
  );
}

export default FactsheetPage;
