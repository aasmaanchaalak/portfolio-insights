'use client';

import React from 'react';
import { PositioningChips } from '../positioning/PositioningChip';
import { Conviction, StrategyType, ActionIntent } from '../../../types/positioning';

interface DrawerHeaderProps {
  stockName: string;
  stockCode: string | null;
  onClose: () => void;
  positioning?: { conviction?: Conviction; strategyType?: StrategyType; actionIntent?: ActionIntent } | null;
}

export function DrawerHeader({ stockName, stockCode, onClose, positioning }: DrawerHeaderProps) {
  return (
    <div className="drawer-header">
      <div className="drawer-header-content">
        <div className="drawer-title-row">
          <h2 id="drawer-title" className="drawer-title">{stockName}</h2>
          {positioning && (positioning.conviction || positioning.strategyType || positioning.actionIntent) && (
            <PositioningChips
              conviction={positioning.conviction}
              strategyType={positioning.strategyType}
              actionIntent={positioning.actionIntent}
              size="small"
            />
          )}
        </div>
        {stockCode && <span className="drawer-stock-code">{stockCode}</span>}
      </div>
      <button className="drawer-close-btn" onClick={onClose} aria-label="Close" type="button">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
