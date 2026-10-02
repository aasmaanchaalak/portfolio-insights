'use client';

// F&O block on the Overview page, below the top figures (FO_BRIEF.md).

import React from 'react';
import { useFoDashboard } from './FOPage';
import { FOSummary } from './FOSummary';
import './fo.css';

export function FOOverviewSection({ onOpen }: { onOpen: () => void }) {
  const { data } = useFoDashboard();
  if (!data?.asOf || data.legs.length === 0) return null;
  const n = data.underlyings.length;
  return (
    <section className="fo-ov">
      <div className="fo-ov-head">
        <div className="fo-ov-title">
          <h2 className="serif">F&amp;O</h2>
          <span className="fo-sec-note">Hedges, covered calls and futures · {n} {n === 1 ? 'underlying' : 'underlyings'}</span>
        </div>
        <button type="button" className="fo-link" onClick={onOpen}>Open F&amp;O dashboard ›</button>
      </div>
      <FOSummary data={data} variant="overview" />
    </section>
  );
}
