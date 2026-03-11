'use client';

import React from 'react';

interface DrawerHeaderProps {
  stockName: string;
  stockCode: string | null;
  onClose: () => void;
}

export function DrawerHeader({ stockName, stockCode, onClose }: DrawerHeaderProps) {
  return (
    <div className="drawer-header">
      <div className="drawer-header-content">
        <h2 id="drawer-title" className="drawer-title">
          {stockName}
        </h2>
        {stockCode && (
          <span className="drawer-stock-code">{stockCode}</span>
        )}
      </div>
      <button
        className="drawer-close-btn"
        onClick={onClose}
        aria-label="Close drawer"
        type="button"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
