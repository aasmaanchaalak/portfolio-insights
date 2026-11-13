'use client';

// End of the F&O page: market positioning from NSE end-of-day files
// (lib/fo/market.ts). Tiles with the day's change and one-year percentile,
// participant OI table, then stacked charts on one shared session axis:
// FII index futures long % (monthly expiries marked), % of stocks advancing
// (daily + 10-day average), MTF book with daily net flow bars.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MarketData, Participant, ParticipantOi } from '../../../lib/fo/market';
import { grp, shortDate, signColor, signedQty } from './format';

const PARTICIPANTS: Participant[] = ['FII', 'Client', 'Pro', 'DII'];
const MINUS = '−';
const AVG_DAYS = 10;
const MIN_PCTILE_SESSIONS = 60;

type Range = '3M' | '6M' | '1Y';
const RANGE_MONTHS: Record<Range, number> = { '3M': 3, '6M': 6, '1Y': 12 };

// ---------- maths ----------

const longPct = (o: ParticipantOi) => {
  const t = o.futIdxLong + o.futIdxShort;
  return t > 0 ? (o.futIdxLong / t) * 100 : null;
};
const advPct = (b: { advances: number; declines: number }) =>
  b.advances + b.declines > 0 ? (b.advances / (b.advances + b.declines)) * 100 : null;
const mtfFlow = (m: { fresh: number; liquidated: number }) => m.fresh - m.liquidated;

const ppSigned = (v: number) => (Math.abs(v) < 0.05 ? '0.0' : (v > 0 ? '+' : MINUS) + Math.abs(v).toFixed(1)) + ' pp';
/** ₹ lakh → "₹1,45,527 Cr" */
const crFromLakh = (lakh: number) => '₹' + grp(lakh / 100) + ' Cr';
const crSignedFromLakh = (lakh: number) => (Math.abs(lakh) < 50 ? '₹0' : (lakh > 0 ? '+' : MINUS) + '₹' + grp(Math.abs(lakh) / 100) + ' Cr');
const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return n + s;
};

const isoMinusMonths = (iso: string, months: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};

/**
 * Percentile of the latest value within the last year of `series` (ascending
 * by date). Null until there are enough sessions to mean anything.
 */
function percentile(series: { date: string; v: number }[]): { pct: number; label: string } | null {
  if (!series.length) return null;
  const last = series[series.length - 1];
  const from = isoMinusMonths(last.date, 12);
  const win = series.filter(p => p.date > from);
  if (win.length < MIN_PCTILE_SESSIONS) return null;
  const below = win.filter(p => p.v < last.v).length, equal = win.filter(p => p.v === last.v).length;
  const pct = Math.round(((below + 0.5 * equal) / win.length) * 100);
  const fullYear = series[0].date <= isoMinusMonths(last.date, 11);
  return { pct: Math.min(99, Math.max(1, pct)), label: fullYear ? '1Y' : `${win.length} sessions` };
}

/**
 * NSE monthly F&O expiry for each month: the last Tuesday (since Sep 2025;
 * the last Thursday before), moved back to the previous session if it was a
 * holiday. `sessions` is the ascending list of trading days we have.
 */
function monthlyExpiries(sessions: string[]): Set<string> {
  const out = new Set<string>();
  if (!sessions.length) return out;
  const have = new Set(sessions);
  const months = new Set(sessions.map(d => d.slice(0, 7)));
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number);
    const weekday = ym >= '2025-09' ? 2 : 4;
    const d = new Date(Date.UTC(y, m, 0)); // last day of month
    while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
    let iso = d.toISOString().slice(0, 10);
    if (iso > sessions[sessions.length - 1]) continue; // not reached yet
    // Holiday: the previous session we have.
    for (let i = 0; i < 6 && !have.has(iso); i++) {
      d.setUTCDate(d.getUTCDate() - 1);
      iso = d.toISOString().slice(0, 10);
    }
    if (have.has(iso)) out.add(iso);
  }
  return out;
}

function rollingAvg(vals: (number | null)[], n: number): (number | null)[] {
  return vals.map((_, i) => {
    const w = vals.slice(Math.max(0, i - n + 1), i + 1).filter((v): v is number => v != null);
    return w.length >= Math.min(n, 5) ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
}

// ---------- data ----------

function useMarketData() {
  const [data, setData] = useState<(MarketData & { stale: boolean }) | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const get = (q = '') => fetch('/api/fo/market' + q).then(r => (r.ok ? r.json() : Promise.reject()));
    get()
      .then(d => {
        if (cancelled) return;
        setData(d);
        if (d.stale) return get('?refresh=1').then(n => { if (!cancelled) setData(n); });
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);
  return { data, error };
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ---------- charts ----------

interface Series { dates: string[]; fii: (number | null)[]; adv: (number | null)[]; advAvg: (number | null)[]; mtf: (number | null)[]; flow: (number | null)[] }

const GUTTER_L = 64, GUTTER_R = 12;
const PANELS = [
  { key: 'fii', title: 'FII index futures long %', h: 150 },
  { key: 'adv', title: '% of stocks advancing', h: 130 },
  { key: 'mtf', title: 'MTF book (NSE)', h: 110 },
  { key: 'flow', title: 'MTF net flow', h: 64 },
] as const;
const TITLE_H = 22, GAP = 14, AXIS_H = 20;

function Charts({ s, expiries }: { s: Series; expiries: Set<string> }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = s.dates.length;
  const plotW = Math.max(width - GUTTER_L - GUTTER_R, 10);
  const x = (i: number) => GUTTER_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const step = n > 1 ? plotW / (n - 1) : plotW;
  const at = hover ?? n - 1;

  // Panel tops.
  let top = 0;
  const layout = PANELS.map(p => {
    const t = top + TITLE_H;
    top = t + p.h + GAP;
    return { ...p, y0: t, y1: t + p.h };
  });
  const totalH = top - GAP + AXIS_H;

  const line = (vals: (number | null)[], y: (v: number) => number) => {
    let d = '', pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const scale = (lo: number, hi: number, y0: number, y1: number) => (v: number) => y1 - ((v - lo) / (hi - lo || 1)) * (y1 - y0);
  const domain = (vals: (number | null)[], include: number[] = [], padFrac = 0.08): [number, number] => {
    const v = vals.filter((a): a is number => a != null).concat(include);
    if (!v.length) return [0, 1];
    const lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo || Math.abs(hi) || 1) * padFrac;
    return [lo - pad, hi + pad];
  };

  const [fLo, fHi] = domain(s.fii, [50]);
  const fClamped: [number, number] = [Math.max(0, fLo), Math.min(100, fHi)];
  const [mLo, mHi] = domain(s.mtf);
  const flowMax = Math.max(1, ...s.flow.map(v => Math.abs(v ?? 0)));

  const L = Object.fromEntries(layout.map(p => [p.key, p])) as Record<typeof PANELS[number]['key'], typeof layout[number]>;
  const yF = scale(fClamped[0], fClamped[1], L.fii.y0, L.fii.y1);
  const yA = scale(0, 100, L.adv.y0, L.adv.y1);
  const yM = scale(mLo, mHi, L.mtf.y0, L.mtf.y1);
  const flowMid = (L.flow.y0 + L.flow.y1) / 2;
  const yFlow = (v: number) => flowMid - (v / flowMax) * ((L.flow.y1 - L.flow.y0) / 2);

  const fmt = {
    fii: (v: number | null) => (v == null ? '—' : v.toFixed(1) + '%'),
    adv: (v: number | null) => (v == null ? '—' : v.toFixed(0) + '%'),
    mtf: (v: number | null) => (v == null ? '—' : crFromLakh(v)),
    flow: (v: number | null) => (v == null ? '—' : crSignedFromLakh(v)),
  };
  const readout: Record<string, React.ReactNode> = {
    fii: <>{fmt.fii(s.fii[at])}{expiries.has(s.dates[at]) && <tspan className="fo-ch-muted"> · expiry</tspan>}</>,
    adv: <>{fmt.adv(s.adv[at])}<tspan className="fo-ch-muted"> · {AVG_DAYS}-day avg {fmt.adv(s.advAvg[at])}</tspan></>,
    mtf: fmt.mtf(s.mtf[at]),
    flow: fmt.flow(s.flow[at]),
  };

  // Month ticks on the shared axis.
  const months: { i: number; label: string }[] = [];
  s.dates.forEach((d, i) => {
    if (i === 0 || d.slice(0, 7) !== s.dates[i - 1].slice(0, 7)) {
      months.push({ i, label: new Date(d + 'T00:00:00Z').toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }) + (d.slice(5, 7) === '01' ? ' ' + d.slice(2, 4) : '') });
    }
  });
  const yTicks = (lo: number, hi: number, y: (v: number) => number, f: (v: number) => string, count = 3) =>
    Array.from({ length: count }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / count).map(v => (
      <text key={v} x={GUTTER_L - 8} y={y(v) + 3.5} className="fo-ch-tick" textAnchor="end">{f(v)}</text>
    ));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    // The page is zoomed on desktop (html zoom 0.85), so the mouse offset and the
    // drawn coordinates can be on different scales: convert via the rendered width.
    const r = e.currentTarget.getBoundingClientRect();
    const scale = r.width > 0 ? width / r.width : 1;
    const px = (e.clientX - r.left) * scale;
    const i = Math.round((px - GUTTER_L) / step);
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div ref={ref} className="fo-ch">
      {width > 0 && n > 1 && (
        <svg width={width} height={totalH} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
          aria-label={`FII long %, % advancing, MTF book and flow, ${shortDate(s.dates[0])} to ${shortDate(s.dates[n - 1])}`}>
          {layout.map(p => (
            <g key={p.key}>
              <text x={GUTTER_L} y={p.y0 - 8} className="fo-ch-title">{p.title}</text>
              <text x={width - GUTTER_R} y={p.y0 - 8} className="fo-ch-value" textAnchor="end">{readout[p.key]}</text>
              <line x1={GUTTER_L} x2={width - GUTTER_R} y1={p.y1} y2={p.y1} className="fo-ch-frame" />
            </g>
          ))}

          {/* FII long % */}
          {[...expiries].map(d => {
            const i = s.dates.indexOf(d);
            return i < 0 ? null : (
              <g key={d}>
                <line x1={x(i)} x2={x(i)} y1={L.fii.y0} y2={L.fii.y1} className="fo-ch-expiry" />
                <text x={x(i)} y={L.fii.y0 + 9} className="fo-ch-expiry-label" textAnchor="middle">exp</text>
              </g>
            );
          })}
          {yTicks(fClamped[0], fClamped[1], yF, v => v.toFixed(0) + '%')}
          {50 >= fClamped[0] && 50 <= fClamped[1] && <line x1={GUTTER_L} x2={width - GUTTER_R} y1={yF(50)} y2={yF(50)} className="fo-ch-base" />}
          <path d={line(s.fii, yF)} className="fo-ch-line" />

          {/* % advancing */}
          {[25, 75].map(v => <text key={v} x={GUTTER_L - 8} y={yA(v) + 3.5} className="fo-ch-tick" textAnchor="end">{v}%</text>)}
          <text x={GUTTER_L - 8} y={yA(50) + 3.5} className="fo-ch-tick" textAnchor="end">50%</text>
          <line x1={GUTTER_L} x2={width - GUTTER_R} y1={yA(50)} y2={yA(50)} className="fo-ch-base" />
          <path d={line(s.adv, yA)} className="fo-ch-line-daily" />
          <path d={line(s.advAvg, yA)} className="fo-ch-line" />

          {/* MTF book */}
          {yTicks(mLo, mHi, yM, v => (v / 1e7).toFixed(2) + 'L Cr')}
          <path d={line(s.mtf, yM)} className="fo-ch-line" />

          {/* MTF net flow */}
          <line x1={GUTTER_L} x2={width - GUTTER_R} y1={flowMid} y2={flowMid} className="fo-ch-zero" />
          <text x={GUTTER_L - 8} y={L.flow.y0 + 8} className="fo-ch-tick" textAnchor="end">+{grp(flowMax / 100)}</text>
          <text x={GUTTER_L - 8} y={L.flow.y1} className="fo-ch-tick" textAnchor="end">{MINUS}{grp(flowMax / 100)}</text>
          {s.flow.map((v, i) => v == null ? null : (
            <rect key={i} x={x(i) - Math.max(1, step * 0.35)} width={Math.max(2, step * 0.7)}
              y={Math.min(yFlow(v), flowMid)} height={Math.max(0.75, Math.abs(yFlow(v) - flowMid))}
              fill={v >= 0 ? 'var(--positive)' : 'var(--negative)'} opacity={hover == null || hover === i ? 1 : 0.55} />
          ))}

          {/* shared axis */}
          {months.map(m => (
            <text key={m.i} x={x(m.i)} y={totalH - 4} className="fo-ch-tick" textAnchor={m.i === 0 ? 'start' : 'middle'}>{m.label}</text>
          ))}

          {/* crosshair */}
          {hover != null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={L.fii.y0} y2={L.flow.y1} className="fo-ch-cross" />
              <text x={x(hover)} y={totalH - AXIS_H + 6} className="fo-ch-cross-date" textAnchor={hover > n * 0.9 ? 'end' : hover < n * 0.1 ? 'start' : 'middle'}>{shortDate(s.dates[hover])}</text>
            </>
          )}
          {[['fii', s.fii, yF], ['adv', s.advAvg, yA], ['mtf', s.mtf, yM]].map(([k, vals, y]: any) =>
            vals[at] == null ? null : <circle key={k} cx={x(at)} cy={y(vals[at])} r={3} className="fo-ch-dot" />)}
        </svg>
      )}
    </div>
  );
}

// ---------- section ----------

export function FOMarket() {
  const { data, error } = useMarketData();
  const [range, setRange] = useState<Range>('3M');

  const all = useMemo(() => {
    if (!data) return null;
    const oiDates = Object.keys(data.oi).sort();
    const adDates = Object.keys(data.breadth).sort();
    const mtfDates = Object.keys(data.mtf).sort();
    const sessions = [...new Set([...oiDates, ...adDates, ...mtfDates])].sort();
    const fii = sessions.map(d => (data.oi[d] ? longPct(data.oi[d].FII) : null));
    const adv = sessions.map(d => (data.breadth[d] ? advPct(data.breadth[d]) : null));
    return {
      oiDates, adDates, mtfDates, sessions,
      fii, adv, advAvg: rollingAvg(adv, AVG_DAYS),
      mtf: sessions.map(d => data.mtf[d]?.outstanding ?? null),
      flow: sessions.map(d => (data.mtf[d] ? mtfFlow(data.mtf[d]) : null)),
      expiries: monthlyExpiries(sessions),
    };
  }, [data]);

  const head = (note?: string) => (
    <div className="fo-sec-head">
      <h2 className="serif">Market positioning</h2>
      {note && <span className="fo-sec-note">{note}</span>}
    </div>
  );
  if (error) return <div className="fo-mk">{head()}<div className="fo-empty">Could not load NSE market data.</div></div>;
  if (!data || !all) return <div className="fo-mk">{head()}<div className="fo-empty">Loading NSE market data…</div></div>;
  const { oiDates, adDates, mtfDates } = all;
  if (!oiDates.length && !adDates.length && !mtfDates.length) {
    return <div className="fo-mk">{head()}<div className="fo-empty">No NSE data yet. It's fetched every weekday evening after the close.</div></div>;
  }

  const oiD = oiDates[oiDates.length - 1], oiPrev = oiDates[oiDates.length - 2];
  const oi = oiD ? data.oi[oiD] : null, oiP = oiPrev ? data.oi[oiPrev] : null;
  const adD = adDates[adDates.length - 1];
  const ad = adD ? data.breadth[adD] : null;
  const mtfD = mtfDates[mtfDates.length - 1];
  const mtf = mtfD ? data.mtf[mtfD] : null;

  const pctNote = (series: { date: string; v: number }[]) => {
    const p = percentile(series);
    return p ? `${ordinal(p.pct)} pct ${p.label}` : null;
  };
  const seriesOf = (dates: string[], f: (d: string) => number | null) =>
    dates.map(d => ({ date: d, v: f(d) })).filter((p): p is { date: string; v: number } => p.v != null);

  const strip: { label: string; val: string; sub: { text: string; color?: string }[] }[] = [];
  if (oi) {
    for (const p of ['FII', 'Client', 'Pro'] as Participant[]) {
      const v = longPct(oi[p]), pv = oiP ? longPct(oiP[p]) : null;
      const pc = pctNote(seriesOf(oiDates, d => longPct(data.oi[d][p])));
      strip.push({
        label: `${p} index futures long`,
        val: v == null ? '—' : v.toFixed(1) + '%',
        sub: [
          ...(v != null && pv != null ? [{ text: ppSigned(v - pv), color: signColor(v - pv, 0.05) }] : []),
          ...(pc ? [{ text: pc }] : []),
        ],
      });
    }
  }
  if (ad) {
    const pc = pctNote(seriesOf(adDates, d => advPct(data.breadth[d])));
    strip.push({
      label: 'Advance / decline',
      val: ad.declines > 0 ? (ad.advances / ad.declines).toFixed(2) : '—',
      sub: [{ text: `${advPct(ad)!.toFixed(0)}% advancing` }, ...(pc ? [{ text: pc }] : [])],
    });
  }
  if (mtf) {
    const flow = mtfFlow(mtf);
    const pc = pctNote(seriesOf(mtfDates, d => data.mtf[d].outstanding));
    strip.push({
      label: 'MTF book (NSE)',
      val: crFromLakh(mtf.outstanding),
      sub: [{ text: crSignedFromLakh(flow) + ' net', color: signColor(flow, 50) }, ...(pc ? [{ text: pc }] : [])],
    });
  }

  const from = all.sessions.length ? isoMinusMonths(all.sessions[all.sessions.length - 1], RANGE_MONTHS[range]) : '';
  const start = all.sessions.findIndex(d => d > from);
  const cut = <T,>(a: T[]) => a.slice(Math.max(0, start));
  const series: Series = {
    dates: cut(all.sessions), fii: cut(all.fii), adv: cut(all.adv), advAvg: cut(all.advAvg), mtf: cut(all.mtf), flow: cut(all.flow),
  };
  const haveMonths = all.sessions.length ? (Date.parse(all.sessions[all.sessions.length - 1]) - Date.parse(all.sessions[0])) / (30.4 * 86400e3) : 0;

  const notes = [
    oiD && `OI & breadth of ${shortDate(oiD)}`,
    !oiD && adD && `breadth of ${shortDate(adD)}`,
    mtfD && `MTF of ${shortDate(mtfD)}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="fo-mk">
      {head(`NSE end of day · ${notes}`)}
      <div className="fo-pnl-strip">
        {strip.map(s => (
          <div key={s.label}>
            <div className="fo-lbl">{s.label}</div>
            <div className="n fo-strip-val">{s.val}</div>
            {s.sub.length > 0 && (
              <div className="n fo-mk-sub">
                {s.sub.map((x, i) => <span key={i} style={x.color ? { color: x.color } : undefined}>{i ? ' · ' : ''}{x.text}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>

      {oi && (
        <>
          <div className="fo-sub-head">Open contracts by participant · {shortDate(oiD!)}</div>
          <div className="fo-scroll fo-mk-scroll">
            <div className="fo-mk-table">
              <div className="fo-mk-row fo-c-head">
                <span>Participant</span>
                <span className="fo-r">Index fut long</span>
                <span className="fo-r">Index fut short</span>
                <span className="fo-r">Long %</span>
                <span className="fo-r">Net index fut, day chg</span>
                <span className="fo-r">Index calls net</span>
                <span className="fo-r">Index puts net</span>
                <span className="fo-r">Stock fut net</span>
              </div>
              {PARTICIPANTS.map(p => {
                const o = oi[p], prev = oiP?.[p];
                const lp = longPct(o), plp = prev ? longPct(prev) : null;
                const netChg = prev ? (o.futIdxLong - o.futIdxShort) - (prev.futIdxLong - prev.futIdxShort) : null;
                const calls = o.idxCallLong - o.idxCallShort, puts = o.idxPutLong - o.idxPutShort;
                const stk = o.futStkLong - o.futStkShort;
                return (
                  <div key={p} className={`fo-mk-row ${p === 'FII' ? 'is-fii' : ''}`}>
                    <span className="fo-mk-who">{p}</span>
                    <span className="n fo-r fo-ink2">{grp(o.futIdxLong)}</span>
                    <span className="n fo-r fo-ink2">{grp(o.futIdxShort)}</span>
                    <span className="n fo-r fo-b6" title={plp != null && lp != null ? `${ppSigned(lp - plp)} on the day` : undefined}>
                      {lp == null ? '—' : lp.toFixed(1) + '%'}
                    </span>
                    <span className="n fo-r" style={{ color: signColor(netChg, 1) }}>{netChg == null ? '—' : signedQty(netChg)}</span>
                    <span className="n fo-r fo-ink2">{signedQty(calls)}</span>
                    <span className="n fo-r fo-ink2">{signedQty(puts)}</span>
                    <span className="n fo-r fo-ink2">{signedQty(stk)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="fo-foot">
            <b>Client</b>: retail and other non-institutional accounts trading through brokers. <b>Pro</b>: brokers trading
            their own money (proprietary desks). <b>FII</b>: foreign portfolio investors. <b>DII</b>: domestic institutions
            (mutual funds, insurers, banks). Contracts open at the close; net = long − short. Positions are left uncoloured: long puts
            are bearish or a hedge, and DII short stock futures are mostly arbitrage and hedging, so the sign alone doesn't say
            bullish or bearish. Only the day change is coloured.
          </div>
        </>
      )}

      <div className="fo-sec-head fo-sec-head-controls fo-mk-charts-head">
        <div>
          <h2 className="serif">Trend</h2>
          <div className="fo-sec-note">
            One session per point · dashed line at 50% · <span className="fo-mk-key-exp" /> monthly expiry (last Tuesday)
            {haveMonths < RANGE_MONTHS[range] - 0.5 && ` · ${Math.max(1, Math.round(haveMonths))} months of data so far`}
          </div>
        </div>
        <div className="fo-seg">
          {(['3M', '6M', '1Y'] as Range[]).map(r => (
            <button key={r} type="button" className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>
      <Charts s={series} expiries={all.expiries} />
      <div className="fo-foot">
        % advancing = advances ÷ (advances + declines), mainboard stocks only (EQ, BE, BZ); the thin line is daily, the bold one its {AVG_DAYS}-day average.
        Index futures OI drops and rebuilds around expiry, so long % can jump there for mechanical reasons.
        MTF is NSE only and lags a day; net flow = fresh exposure − exposure liquidated.
      </div>
    </div>
  );
}
