'use client';

import React, { useEffect, useState } from 'react';
import { PositioningSection } from '../positioning/PositioningSection';

interface RealizedExit {
  id: string;
  quantity: number | null;
  avgBuyPrice: number | null;
  exitPrice: number | null;
  exitDate: string;
  entryDate: string | null;
  entryPrice: number | null;
}

export interface PortfolioHistory {
  realizedExits: RealizedExit[];
  entryData: { entryDate: string | null; entryPrice: number | null } | null;
  remarks: string | null;
  assignedTo: string | null;
  bucket: string | null;
  positioning: object | null;
  themes: string[];
  pledge: { pledgedQty: number | null; pledgedWhere: string | null } | null;
}

// True when the stock carries anything recorded from its time as a holding.
export function hasPortfolioHistory(h: PortfolioHistory | null): boolean {
  if (!h) return false;
  return h.realizedExits.length > 0 || !!h.entryData || !!h.remarks || !!h.assignedTo
    || !!h.bucket || !!h.positioning || h.themes.length > 0 || !!h.pledge;
}

function price(n: number | null | undefined): string {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function qty(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function date(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="pipeline-history-field">
      <span className="label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

// Everything recorded for the stock while it was held: exit snapshot(s), entry
// data, remarks, assignment, bucket, pledge (read-only here) plus the editable
// positioning & themes section shared with the holdings drawer.
export function PortfolioHistoryTab({ ticker, history }: { ticker: string; history: PortfolioHistory | null }) {
  if (!history) return <p className="pipeline-muted">Loading…</p>;

  return (
    <>
      {history.realizedExits.length > 0 && (
        <div className="pipeline-section">
          <h4>Exit</h4>
          {history.realizedExits.map(e => {
            const cost = e.avgBuyPrice;
            const gain = cost && e.exitPrice ? ((e.exitPrice - cost) / cost) * 100 : null;
            return (
              <div key={e.id} className="pipeline-history-grid">
                <Field label="Exit date" value={date(e.exitDate)} />
                <Field label="Exit price" value={price(e.exitPrice)} />
                <Field label="Avg buy price" value={price(e.avgBuyPrice)} />
                <Field
                  label="Realized gain"
                  value={gain == null ? '—' : (
                    <span className={gain >= 0 ? 'pipeline-change-pos' : 'pipeline-change-neg'}>
                      {gain >= 0 ? '+' : ''}{gain.toFixed(1)}%
                    </span>
                  )}
                />
                <Field label="Quantity sold" value={qty(e.quantity)} />
                <Field label="Entry" value={e.entryDate ? `${date(e.entryDate)} @ ${price(e.entryPrice)}` : '—'} />
              </div>
            );
          })}
        </div>
      )}

      <div className="pipeline-section">
        <h4>While held</h4>
        <div className="pipeline-history-grid">
          <Field label="Entry date" value={date(history.entryData?.entryDate)} />
          <Field label="Entry price" value={price(history.entryData?.entryPrice)} />
          <Field label="Assigned to" value={history.assignedTo || '—'} />
          <Field label="Bucket" value={history.bucket || '—'} />
          {history.pledge && (
            <Field
              label="Pledged"
              value={`${qty(history.pledge.pledgedQty)}${history.pledge.pledgedWhere ? ` (${history.pledge.pledgedWhere})` : ''}`}
            />
          )}
        </div>
      </div>

      <div className="pipeline-section">
        <h4>Remarks</h4>
        {history.remarks
          ? <p style={{ whiteSpace: 'pre-wrap' }}>{history.remarks}</p>
          : <p className="pipeline-muted">No remarks</p>}
      </div>

      <div className="pipeline-section">
        <h4>Positioning &amp; themes</h4>
        <PositioningSection stockCode={ticker} />
      </div>
    </>
  );
}
