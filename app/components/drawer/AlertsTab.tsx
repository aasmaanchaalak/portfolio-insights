'use client';

import React from 'react';

// Must match STOP_LOSS_PCT in lib/stockAlerts.ts.
const STOP_LOSS_PCT = 20;

interface PriceAlert {
  id: number;
  targetPrice: number;
  direction: 'above' | 'below';
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  triggeredAt: string | null;
  triggeredPrice: number | null;
}

interface AlertsTabProps {
  stockCode: string;
  holding?: any;
}

const rs = (n: number | null | undefined) =>
  n == null || isNaN(n) ? 'N/A' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function AlertsTab({ stockCode, holding }: AlertsTabProps) {
  const [alerts, setAlerts] = React.useState<PriceAlert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [target, setTarget] = React.useState('');
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const price: number | null = holding?.currentPrice ?? null;
  const avgBuy: number | null = holding?.averageBuyPrice > 0 ? holding.averageBuyPrice : null;
  const stop = avgBuy != null ? avgBuy * (1 - STOP_LOSS_PCT / 100) : null;

  React.useEffect(() => {
    setLoading(true);
    fetch(`/api/price-alerts?code=${encodeURIComponent(stockCode)}`)
      .then(r => (r.ok ? r.json() : []))
      .then(setAlerts)
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [stockCode]);

  const targetNum = parseFloat(target);
  const preview = price != null && targetNum > 0 && targetNum !== price
    ? (targetNum > price ? 'Alerts when it rises to' : 'Alerts when it falls to')
    : null;

  const add = async () => {
    if (!(targetNum > 0)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/price-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: stockCode, targetPrice: targetNum, note, currentPrice: price }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save the alert');
      setAlerts(a => [json, ...a]);
      setTarget('');
      setNote('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    const res = await fetch(`/api/price-alerts?id=${id}`, { method: 'DELETE' });
    if (res.ok) setAlerts(a => a.filter(x => x.id !== id));
  };

  const active = alerts.filter(a => !a.triggeredAt);
  const fired = alerts.filter(a => a.triggeredAt);

  return (
    <div className="stock-details-tab">
      <div className="stock-details-section">
        <div className="stock-details-section-title">Stop loss ({STOP_LOSS_PCT}% below avg buy)</div>
        {stop == null ? (
          <div className="stock-alerts-empty">No average buy price, so no stop loss.</div>
        ) : (
          <>
            <div className="stock-details-row"><span className="stock-details-label">Avg buy</span><span className="stock-details-value">{rs(avgBuy)}</span></div>
            <div className="stock-details-row"><span className="stock-details-label">Stop loss</span><span className="stock-details-value">{rs(stop)}</span></div>
            <div className="stock-details-row">
              <span className="stock-details-label">Current price</span>
              <span className="stock-details-value" style={{ color: price != null && price < stop ? 'var(--negative)' : undefined }}>
                {rs(price)}{price != null && price < stop ? ' · below stop loss' : ''}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="stock-details-section">
        <div className="stock-details-section-title">Price alerts</div>
        <div className="stock-alerts-form">
          <input
            className="stock-alerts-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.05"
            placeholder="Target price"
            value={target}
            onChange={e => setTarget(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
          />
          <input
            className="stock-alerts-input stock-alerts-note"
            type="text"
            placeholder="Note (optional)"
            maxLength={200}
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
          />
          <button className="stock-alerts-add" onClick={add} disabled={saving || !(targetNum > 0)}>
            {saving ? 'Saving…' : 'Add alert'}
          </button>
        </div>
        <div className="stock-alerts-hint">
          {preview ? `${preview} ${rs(targetNum)} (now ${rs(price)}).` : `Now ${rs(price)}. Checked every 10 minutes in market hours; each alert notifies once.`}
        </div>
        {error && <div className="stock-alerts-error">{error}</div>}

        {loading ? (
          <div className="stock-alerts-empty">Loading…</div>
        ) : active.length === 0 ? (
          <div className="stock-alerts-empty">No active price alerts.</div>
        ) : active.map(a => (
          <div key={a.id} className="stock-details-row stock-alerts-item">
            <span className="stock-details-label">
              {a.direction === 'above' ? '↑ Rises to' : '↓ Falls to'} {rs(a.targetPrice)}
              {a.note ? <span className="stock-alerts-meta"> · {a.note}</span> : null}
            </span>
            <button className="stock-alerts-remove" onClick={() => remove(a.id)} aria-label="Delete alert">Remove</button>
          </div>
        ))}
      </div>

      {fired.length > 0 && (
        <div className="stock-details-section">
          <div className="stock-details-section-title">Triggered</div>
          {fired.map(a => (
            <div key={a.id} className="stock-details-row stock-alerts-item">
              <span className="stock-details-label">
                {a.direction === 'above' ? '↑' : '↓'} {rs(a.targetPrice)}
                <span className="stock-alerts-meta"> · hit {rs(a.triggeredPrice)} on {when(a.triggeredAt!)}</span>
              </span>
              <button className="stock-alerts-remove" onClick={() => remove(a.id)} aria-label="Delete alert">Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
