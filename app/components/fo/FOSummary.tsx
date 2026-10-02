'use client';

import React from 'react';
import { FoDashboard } from '../../../lib/fo/types';
import { rsAbs, rsSigned, signColor, pctSigned, shortDate } from './format';

/** The six F&O figures shared by the dashboard and the Overview section. */
export function foSummaryCells(d: FoDashboard) {
  const legs = d.legs;
  const today = legs.some(l => l.today != null) ? legs.reduce((s, l) => s + (l.today ?? 0), 0) : null;
  const open = legs.reduce((s, l) => s + l.openPnl, 0);
  const delta = legs.reduce((s, l) => s + l.deltaRs, 0);
  const m = d.margin;
  const util = m.available > 0 ? (m.used / m.available) * 100 : null;
  const cells: { label: string; value: string; color: string; note: string; bar?: number | null }[] = [
    {
      label: d.pricedAt ? 'Today MTM' : 'Last session MTM',
      value: today == null ? '—' : rsSigned(today),
      color: today == null ? 'var(--null)' : signColor(today),
      note: `${legs.length} open ${legs.length === 1 ? 'leg' : 'legs'}`,
    },
    {
      label: d.month ? `${d.month.label}, net` : 'Month, net',
      value: d.month ? rsSigned(d.month.net) : '—',
      color: d.month ? signColor(d.month.net) : 'var(--null)',
      note: d.month ? `after ${rsAbs(d.month.charges)} charges` : 'no reports this month',
    },
    { label: 'Open P&L', value: rsSigned(open), color: signColor(open), note: 'on current positions' },
    {
      label: 'Net delta',
      value: rsSigned(delta),
      color: 'var(--ink)',
      note: (d.book ? `${pctSigned((delta / d.book) * 100, 1)} of book · ` : '') + (delta < 0 ? 'net short' : 'net long'),
    },
    {
      label: 'Margin used',
      value: rsAbs(m.used),
      color: 'var(--ink)',
      note: m.available > 0 ? `of ${rsAbs(m.available)} · ${util!.toFixed(1)}%` : 'collateral not set',
      bar: util,
    },
    {
      label: 'Next expiry',
      value: d.nextExpiry ? shortDate(d.nextExpiry.date) : '—',
      color: d.nextExpiry ? 'var(--ink)' : 'var(--null)',
      note: d.nextExpiry
        ? `${d.nextExpiry.legs} ${d.nextExpiry.legs === 1 ? 'leg' : 'legs'} · ${d.nextExpiry.days <= 0 ? 'today' : `in ${d.nextExpiry.days} ${d.nextExpiry.days === 1 ? 'day' : 'days'}`}`
        : 'no open legs',
    },
  ];
  return cells;
}

export const utilColor = (u: number | null) =>
  u == null ? 'var(--ink)' : u >= 80 ? 'var(--negative)' : u >= 60 ? 'var(--caution-ink)' : 'var(--ink)';

export function FOSummary({ data, variant }: { data: FoDashboard; variant: 'page' | 'overview' }) {
  return (
    <div className={`fo-rail fo-rail-${variant}`}>
      {foSummaryCells(data).map(c => (
        <div key={c.label} className="fo-rail-cell">
          <div className="fo-rail-label">{c.label}</div>
          <div className="fo-rail-value n" style={{ color: c.color }}>{c.value}</div>
          <div className="fo-rail-note n">{c.note}</div>
          {c.bar != null && (
            <div className="fo-util-bar"><div style={{ width: `${Math.min(c.bar, 100)}%`, background: utilColor(c.bar) === 'var(--ink)' ? 'var(--accent-bar)' : utilColor(c.bar) }} /></div>
          )}
        </div>
      ))}
    </div>
  );
}
