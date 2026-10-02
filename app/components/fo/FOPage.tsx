'use client';

// F&O dashboard (FO_BRIEF.md): summary row, positions grouped by
// underlying, month P&L, margin and collateral.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FoDashboard, DashLeg, Purpose, PURPOSES } from '../../../lib/fo/types';
import { isIndianMarketOpen } from '../../../lib/marketHours';
import { FOSummary, utilColor } from './FOSummary';
import { grp, px, rsAbs, rsSigned, rsOrDash, pctSigned, signColor, shortDate } from './format';
import './fo.css';

const COLS = 'minmax(230px,2fr) 92px 92px 88px 88px 96px 100px 104px 90px';
// Cash can be a debit balance: unsigned amount, with a minus when negative.
const cashRs = (v: number) => (v < 0 ? '\u2212' : '') + rsAbs(v);
const REFRESH_MS = 2 * 60 * 1000;

export function useFoDashboard() {
  const [data, setData] = useState<FoDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/fo');
      if (!res.ok) throw new Error(res.status === 403 ? 'You don\'t have access to F&O.' : 'Could not load F&O data.');
      setData(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(() => { if (isIndianMarketOpen() && document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);
  return { data, error, reload: load, setData };
}

const sum = (legs: DashLeg[], f: (l: DashLeg) => number) => legs.reduce((s, l) => s + f(l), 0);
const todaySum = (legs: DashLeg[]) => (legs.some(l => l.today != null) ? sum(legs, l => l.today ?? 0) : null);

function legLabel(l: DashLeg) {
  return `${l.underlying} ${shortDate(l.expiry)}${l.strike != null ? ' ' + grp(l.strike, l.strike % 1 ? 2 : 0) : ''} ${l.type}`;
}

function Signed({ v, bold }: { v: number | null; bold?: boolean }) {
  if (v == null) return <span className="n fo-r fo-null">—</span>;
  return <span className="n fo-r" style={{ color: signColor(v), fontWeight: bold ? 700 : 600 }}>{rsSigned(v)}</span>;
}

function Seg<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="fo-seg">
      {options.map(o => (
        <button key={o.id} type="button" className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="fo-sec-head">
      <h2 className="serif">{title}</h2>
      {note && <span className="fo-sec-note">{note}</span>}
    </div>
  );
}

// ---------- positions ----------

function Positions({ data, canEdit, onPurpose }: { data: FoDashboard; canEdit: boolean; onPurpose: (l: DashLeg, p: Purpose | null) => void }) {
  const [exp, setExp] = useState<string>('all');
  const [purpose, setPurpose] = useState<'all' | Purpose>('all');
  const expiries = useMemo(() => [...new Set(data.legs.map(l => l.expiry))].sort(), [data.legs]);
  useEffect(() => { if (exp !== 'all' && !expiries.includes(exp)) setExp('all'); }, [exp, expiries]);

  const shown = data.legs.filter(l => (exp === 'all' || l.expiry === exp) && (purpose === 'all' || l.purpose === purpose));
  const groups = data.underlyings
    .map(u => ({ u, legs: shown.filter(l => l.underlying === u.symbol) }))
    .filter(g => g.legs.length)
    .sort((a, b) => sum(b.legs, l => Math.abs(l.deltaRs)) - sum(a.legs, l => Math.abs(l.deltaRs)));
  const filtered = exp !== 'all' || purpose !== 'all';

  return (
    <>
      <div className="fo-sec-head fo-sec-head-controls">
        <div>
          <h2 className="serif">Positions</h2>
          <div className="fo-sec-note">Grouped by underlying · delta shown as ₹ exposure</div>
        </div>
        <div className="fo-filters">
          <Seg options={[{ id: 'all', label: 'All expiries' }, ...expiries.map(e => ({ id: e, label: shortDate(e) }))]} value={exp} onChange={setExp} />
          <Seg<'all' | Purpose> options={[{ id: 'all', label: 'All' }, ...PURPOSES.map(p => ({ id: p, label: p }))]} value={purpose} onChange={setPurpose} />
        </div>
      </div>
      <div className="fo-scroll">
        <div className="fo-table">
          <div className="fo-row fo-head" style={{ gridTemplateColumns: COLS }}>
            {['Instrument', 'Purpose', 'Position', 'Avg', 'LTP', 'Today', 'Open P&L', 'Delta ₹', 'Margin'].map((h, i) => (
              <span key={h} className={i < 2 ? '' : 'fo-r'}>{h}</span>
            ))}
          </div>
          {groups.length === 0 && <div className="fo-empty">No positions match these filters.</div>}
          {groups.map(({ u, legs }) => {
            const note = u.hedgedPct != null && u.sharesHeld
              ? `· ${Math.round(u.hedgedPct)}% of ${grp(u.sharesHeld)} shares held ${u.coverKind}`
              : u.sharesHeld ? `· ${grp(u.sharesHeld)} shares held` : '';
            return (
              <React.Fragment key={u.symbol}>
                <div className="fo-row fo-group" style={{ gridTemplateColumns: COLS }}>
                  <div className="fo-group-id">
                    <span className="fo-sym">{u.symbol}</span>
                    {u.spot != null && <span className="n fo-spot">{px(u.spot)}</span>}
                    {u.spotChangePct != null && <span className="n fo-spot-chg" style={{ color: signColor(u.spotChangePct, 0.005) }}>{pctSigned(u.spotChangePct)}</span>}
                    {note && <span className="fo-group-note">{note}</span>}
                  </div>
                  <Signed v={todaySum(legs)} bold />
                  <Signed v={sum(legs, l => l.openPnl)} bold />
                  <span className="n fo-r fo-b">{rsSigned(sum(legs, l => l.deltaRs))}</span>
                  <span className="n fo-r fo-b">{rsOrDash(sum(legs, l => l.margin))}</span>
                </div>
                {legs.map(l => (
                  <div key={l.account + l.contract} className="fo-row fo-leg" style={{ gridTemplateColumns: COLS }}>
                    <div className="fo-leg-id">
                      <span className="fo-chip">{l.type}</span>
                      <span className="n fo-leg-label" title={l.contract}>{legLabel(l)}</span>
                    </div>
                    {canEdit ? (
                      <select
                        className={`fo-purpose ${l.purposeIsDefault ? 'is-default' : ''}`}
                        value={l.purpose}
                        title={l.purposeIsDefault ? 'Set by rule — change to override' : 'Set by hand'}
                        onChange={e => onPurpose(l, e.target.value as Purpose)}
                      >
                        {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : <span className="fo-purpose-text">{l.purpose}</span>}
                    <div className="fo-r">
                      <div className="n fo-lots">{l.lots != null
                        ? `${l.qty > 0 ? '+' : '−'}${grp(Math.abs(l.lots), Math.abs(l.lots) % 1 ? 2 : 0)} ${Math.abs(l.lots) === 1 ? 'lot' : 'lots'}`
                        : `${l.qty > 0 ? '+' : '−'}${grp(Math.abs(l.qty))}`}</div>
                      <div className="n fo-qty">{grp(Math.abs(l.qty))} qty</div>
                    </div>
                    <span className="n fo-r fo-ink2">{px(l.avg)}</span>
                    <span className="n fo-r" title={l.ltpIsEstimate ? 'Estimated from the live price of the underlying' : 'Close on the report date'}>
                      {l.ltpIsEstimate && <span className="fo-est">≈</span>}{px(l.ltp)}
                    </span>
                    <Signed v={l.today} />
                    <Signed v={l.openPnl} />
                    <span className="n fo-r fo-ink3">{rsSigned(l.deltaRs)}</span>
                    <span className="n fo-r fo-ink3">{rsOrDash(l.margin)}</span>
                  </div>
                ))}
              </React.Fragment>
            );
          })}
          <div className="fo-row fo-total" style={{ gridTemplateColumns: COLS }}>
            <span className="fo-total-label">
              {filtered ? `Total · ${shown.length} of ${data.legs.length} legs` : `Total · ${data.legs.length} ${data.legs.length === 1 ? 'leg' : 'legs'}`}
            </span>
            <Signed v={todaySum(shown)} bold />
            <Signed v={sum(shown, l => l.openPnl)} bold />
            <span className="n fo-r fo-b">{rsSigned(sum(shown, l => l.deltaRs))}</span>
            <span className="n fo-r fo-b">{rsOrDash(sum(shown, l => l.margin))}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- P&L ----------

function PnL({ data }: { data: FoDashboard }) {
  const m = data.month;
  if (!m) return null;
  const series = m.days;
  const maxP = Math.max(0, ...series.map(d => d.pnl));
  const maxN = Math.max(0, ...series.map(d => -d.pnl));
  const span = maxP + maxN || 1;
  const zero = (maxP / span) * 100;
  const best = series.length ? Math.max(...series.map(d => d.pnl)) : null;
  const worst = series.length ? Math.min(...series.map(d => d.pnl)) : null;
  const up = series.filter(d => d.pnl > 0).length;
  const gross = m.net + m.charges;

  const rows = [...m.byUnderlying.map(r => ({ ...r, agg: false })), ...(Math.abs(m.closed) >= 1 ? [{ name: 'Closed this month', pnl: m.closed, agg: true }] : [])];
  const mp = Math.max(0, ...rows.map(r => r.pnl)), mn = Math.max(0, ...rows.map(r => -r.pnl));
  const sp = mp + mn || 1;
  const origin = Math.min(Math.max((mn / sp) * 100, 4), 96);

  const summary = [
    { label: 'Gross', val: rsSigned(gross), color: signColor(gross) },
    { label: 'Charges', val: m.charges >= 1 ? '−' + rsAbs(m.charges) : '₹0', color: 'var(--ink)' },
    { label: 'Net', val: rsSigned(m.net), color: signColor(m.net) },
    { label: 'Best / worst day', val: best == null ? '—' : `${rsSigned(best)} / ${rsSigned(worst!)}`, color: 'var(--ink)' },
    { label: 'Up days', val: `${up} of ${series.length}`, color: 'var(--ink)' },
  ];
  const purposeNotes: Record<Purpose, string> = {
    Hedge: 'Net cost of protection',
    Income: 'Premium captured on short options',
    Directional: 'Futures and long options, incl. closed trades',
  };

  return (
    <div className="fo-two-col">
      <div>
        <SectionHead title={`P&L · ${m.label}`} note="Daily MTM, realised + unrealised" />
        <div className="fo-pnl-strip">
          {summary.map(s => (
            <div key={s.label}>
              <div className="fo-lbl">{s.label}</div>
              <div className="n fo-strip-val" style={{ color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
        {series.length === 0 ? (
          <div className="fo-empty">No daily P&L yet. It builds up from consecutive daily reports.</div>
        ) : (
          <>
            <div className="fo-bars">
              <div className="fo-zero" style={{ top: `${zero}%` }} />
              <div className="fo-bars-inner">
                {series.map(d => {
                  const h = (Math.abs(d.pnl) / span) * 100;
                  return (
                    <div key={d.date} className="fo-bar" title={`${shortDate(d.date)}${d.live ? ' (live)' : ''}: ${rsSigned(d.pnl)}`}>
                      <div style={{
                        top: `${d.pnl >= 0 ? zero - h : zero}%`, height: `${Math.max(h, 0.6)}%`,
                        background: d.pnl >= 0 ? 'var(--positive)' : 'var(--negative)', opacity: d.live ? 0.55 : 1,
                      }} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="fo-bar-labels">
              {series.map((d, i) => (
                <span key={d.date} className="n">{i % 5 === 0 || i === series.length - 1 ? Number(d.date.slice(8)) : ''}</span>
              ))}
            </div>
          </>
        )}
      </div>
      <div>
        <SectionHead title="Where it came from" note={`${m.label}, net of charges`} />
        <div className="fo-div-rows">
          {rows.length === 0 && <div className="fo-empty">Nothing yet this month.</div>}
          {rows.map(r => {
            const w = Math.max((Math.abs(r.pnl) / sp) * 100, 0.5);
            return (
              <div key={r.name} className="fo-div-row">
                <span className={`fo-div-name ${r.agg ? 'agg' : ''}`}>{r.name}</span>
                <div className="fo-div-track">
                  <div className="fo-div-origin" style={{ left: `${origin}%` }} />
                  <div className="fo-div-bar" style={{
                    left: `${r.pnl >= 0 ? origin : origin - w}%`, width: `${w}%`,
                    background: r.agg ? (r.pnl >= 0 ? 'oklch(0.82 0.05 155)' : 'oklch(0.84 0.055 22)') : (r.pnl >= 0 ? 'var(--positive)' : 'var(--negative)'),
                  }} />
                </div>
                <span className="n fo-div-val" style={{ color: signColor(r.pnl) }}>{rsSigned(r.pnl)}</span>
              </div>
            );
          })}
        </div>
        <div className="fo-sub-head">By purpose</div>
        {PURPOSES.map(p => (
          <div key={p} className="fo-purpose-row">
            <span className="fo-purpose-name">{p}</span>
            <span className="fo-purpose-note">{purposeNotes[p]}</span>
            <span className="n" style={{ color: signColor(m.byPurpose[p]), fontWeight: 600 }}>{rsSigned(m.byPurpose[p])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- margin ----------

function Margin({ data }: { data: FoDashboard }) {
  const m = data.margin;
  const util = m.available > 0 ? (m.used / m.available) * 100 : null;
  const base = m.available > 0 ? m.available : m.used || 1;
  const need = m.used * 0.5;
  const ok = m.cashForRule >= need;

  const byU = new Map<string, number>();
  for (const l of data.legs) if (l.margin > 0) byU.set(l.underlying, (byU.get(l.underlying) ?? 0) + l.margin);
  const mU = [...byU.entries()].sort((a, b) => b[1] - a[1]);
  const mMax = mU[0]?.[1] || 1;

  return (
    <div className="fo-two-col">
      <div>
        <SectionHead title="Margin" note={`SPAN + exposure + MTM loss, against cash + collateral${m.spanAsOf ? ` · NSE SPAN of ${shortDate(m.spanAsOf)}` : ''}`} />
        <div className="fo-m-head">
          <div className="n">
            <span className="serif fo-m-used">{rsAbs(m.used)}</span>
            <span className="fo-m-of">{m.available > 0 ? `used of ${rsAbs(m.available)}` : 'used'}</span>
          </div>
          {util != null && <span className="n fo-m-util" style={{ color: utilColor(util) }}>{util.toFixed(1)}% utilised</span>}
        </div>
        <div className="fo-m-bar">
          <div title="SPAN + exposure" style={{ width: `${Math.min((m.spanExposure / base) * 100, 100)}%`, background: 'oklch(0.5 0.1 27)' }} />
          {m.mtmLoss > 0 && <div title="MTM loss" style={{ width: `${Math.min((m.mtmLoss / base) * 100, 100)}%`, background: 'oklch(0.7 0.07 27)' }} />}
          {m.available > 0 && [60, 80].map(t => <div key={t} className="fo-m-tick" style={{ left: `${t}%` }} />)}
        </div>
        {m.available > 0 && (
          <div className="fo-m-ticklabels">
            <span className="n" style={{ left: '60%' }}>60% caution</span>
            <span className="n" style={{ left: '80%' }}>80% limit</span>
          </div>
        )}
        <div className="fo-m-legend">
          <span><i style={{ background: 'oklch(0.5 0.1 27)' }} /><span className="n">SPAN + exposure {rsAbs(m.spanExposure)}</span></span>
          {m.mtmLoss > 0 && <span><i style={{ background: 'oklch(0.7 0.07 27)' }} /><span className="n">MTM loss {rsAbs(m.mtmLoss)}</span></span>}
          {m.available > 0 && <span><i className="free" /><span className="n">Free {rsAbs(Math.max(m.available - m.used, 0))}</span></span>}
        </div>

        <div className="fo-sub-head">Collateral</div>
        <div className="fo-c-row fo-c-head">
          <span>Source</span><span className="fo-r">Market value</span><span className="fo-r">Haircut</span><span className="fo-r">Counts as</span>
        </div>
        <div className="fo-c-row">
          <div><div className="fo-c-name b">Cash</div><div className="n fo-c-sub">{m.cash < 0 ? 'Debit balance' : m.cash > 0 ? 'Cash available' : 'Not entered yet'}</div></div>
          <span className="n fo-r fo-ink2">{m.cash !== 0 ? cashRs(m.cash) : '—'}</span>
          <span className="n fo-r fo-ink2">0%</span>
          <span className="n fo-r fo-b6">{m.cash !== 0 ? cashRs(m.cash) : '—'}</span>
        </div>
        {m.pledged != null && (
          <div className="fo-c-row">
            <div><div className="fo-c-name b">Pledged holdings</div><div className="n fo-c-sub">Nuvama's margin, after its haircuts</div></div>
            <span className="n fo-r fo-ink2">{m.holdingsValue > 0 ? rsAbs(m.holdingsValue) : '—'}</span>
            <span className="n fo-r fo-ink2">{m.holdingsValue > 0 ? `${Math.max(0, (1 - m.pledged / m.holdingsValue) * 100).toFixed(0)}%` : '—'}</span>
            <span className="n fo-r fo-b6">{rsAbs(m.pledged)}</span>
          </div>
        )}
        {m.pledged != null ? m.collateral.map(c => (
          <div key={c.name} className="fo-c-row fo-c-sub-row">
            <div><div className="fo-c-name">{c.name}</div><div className="n fo-c-sub">{c.sub}</div></div>
            <span className="n fo-r fo-ink2">{rsAbs(c.marketValue)}</span>
            <span /><span />
          </div>
        )) : m.collateral.map(c => (
          <div key={c.name} className="fo-c-row">
            <div><div className="fo-c-name">{c.name}</div><div className="n fo-c-sub">{c.sub}{c.cashLike ? ' · counts as cash' : ''}</div></div>
            <span className="n fo-r fo-ink2">{rsAbs(c.marketValue)}</span>
            <span className="n fo-r fo-ink2">{c.haircutPct >= 100 ? 'not eligible' : `${c.haircutPct.toFixed(c.haircutPct % 1 ? 1 : 0)}%`}</span>
            <span className="n fo-r fo-b6">{rsOrDash(c.value)}</span>
          </div>
        ))}
        <div className="fo-c-row fo-c-total">
          <span>Total available</span><span /><span />
          <span className="n fo-r">{rsAbs(m.available)}</span>
        </div>
        {m.used > 0 && (
          <div className="fo-rule">
            <span className="fo-rule-spine" style={{ background: ok ? 'var(--positive)' : 'var(--negative)' }} />
            <div>
              <div className="fo-rule-head">{ok ? '50% cash rule met' : '50% cash rule breached'}</div>
              <div className="n fo-rule-note">
                Needs {rsAbs(need)} in cash (half of margin used) · have {cashRs(m.cashForRule)}
                {need > 0 && m.cashForRule > 0 && ` · ${(m.cashForRule / need).toFixed(1)}× covered`}
              </div>
            </div>
          </div>
        )}
        <div className="fo-foot">
          {m.pledged != null
            ? 'Haircut on pledged holdings is implied from Nuvama\'s figure and today\'s prices.'
            : 'Collateral estimated with NSE\'s VaR + ELM haircuts; Nuvama applies more. Enter its pledged margin on F&O Data.'}
        </div>
      </div>
      <div>
        <SectionHead title="Margin by underlying" note="Share of margin used" />
        <div className="fo-mu">
          {mU.length === 0 && <div className="fo-empty">No margin blocked.</div>}
          {mU.map(([name, v]) => (
            <div key={name} className="fo-mu-row">
              <div className="fo-mu-top">
                <span className="fo-mu-name">{name}</span>
                <span className="n fo-mu-val"><b>{rsAbs(v)}</b> · {m.used > 0 ? ((v / m.used) * 100).toFixed(0) : 0}%</span>
              </div>
              <div className="fo-mu-track"><div style={{ width: `${(v / mMax) * 100}%` }} /></div>
            </div>
          ))}
          <div className="fo-foot">
            Futures: quantity × price × (NSE SPAN % + exposure %), within a few % of Nuvama.
            {m.isEstimate && ' Some legs have no SPAN rate yet and are estimated from VaR rates.'} Long options need no margin; premium is paid upfront.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- page ----------

export function FOPage({ canEdit, onOpenData }: { canEdit: boolean; onOpenData?: () => void }) {
  const { data, error, reload } = useFoDashboard();

  const setPurpose = async (l: DashLeg, p: Purpose | null) => {
    await fetch('/api/fo/data', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'purpose', account: l.account, contract: l.contract, purpose: p }),
    });
    reload();
  };

  if (error) return <div className="fo-page"><div className="fo-empty">{error}</div></div>;
  if (!data) return <div className="fo-page"><div className="fo-empty">Loading F&amp;O…</div></div>;

  const uCount = data.underlyings.length;
  return (
    <div className="fo-page">
      <div className="fo-title-row">
        <div>
          <h1 className="serif fo-title">F&amp;O</h1>
          <div className="n fo-subtitle">
            {data.legs.length} open {data.legs.length === 1 ? 'leg' : 'legs'} across {uCount} {uCount === 1 ? 'underlying' : 'underlyings'} · NSE
            {data.asOf && <> · Nuvama report of {shortDate(data.asOf)}</>}
            {data.pricedAt && <> · live {new Date(data.pricedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</>}
          </div>
        </div>
        {canEdit && onOpenData && <button type="button" className="fo-link" onClick={onOpenData}>Update F&amp;O data ›</button>}
      </div>
      {!data.asOf ? (
        <div className="fo-empty">No F&amp;O reports yet.{canEdit ? ' Upload Nuvama\'s P&L report on F&O Data.' : ''}</div>
      ) : (
        <>
          <FOSummary data={data} variant="page" />
          <Positions data={data} canEdit={canEdit} onPurpose={setPurpose} />
          <PnL data={data} />
          <Margin data={data} />
        </>
      )}
    </div>
  );
}
