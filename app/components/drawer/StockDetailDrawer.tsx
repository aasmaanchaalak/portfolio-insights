'use client';

import React, { useEffect, useState } from 'react';
import { DrawerHeader } from './DrawerHeader';
import { DrawerTabs, DrawerTab } from './DrawerTabs';
import { ThesisTab } from '../thesis/ThesisTab';
import { ForwardMetricsTab } from '../thesis/ForwardMetricsTab';
import { StockDetailsTab } from './StockDetailsTab';
import { PositioningSection } from '../positioning/PositioningSection';
import { Conviction, StrategyType, ActionIntent } from '../../../types/positioning';
import './drawer.css';

interface StockDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stockCode: string | null;
  stockName: string;
  positioning?: { conviction?: Conviction; strategyType?: StrategyType; actionIntent?: ActionIntent } | null;
  isAnalyst?: boolean;
}

const TABS: DrawerTab[] = [
  { id: 'details', label: 'Details', enabled: true },
  { id: 'thesis', label: 'Thesis', enabled: true },
  { id: 'forward-metrics', label: 'Forward Metrics', enabled: true },
  { id: 'positioning', label: 'Positioning', enabled: true },
];

export function StockDetailDrawer({
  isOpen,
  onClose,
  stockCode,
  stockName,
  positioning,
  isAnalyst = false,
}: StockDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    if (isOpen && stockCode) setActiveTab('details');
  }, [isOpen, stockCode]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const renderContent = () => {
    if (activeTab === 'details') {
      return <StockDetailsTab stockCode={stockCode} stockName={stockName} isAnalyst={isAnalyst} />;
    }
    if (activeTab === 'positioning') {
      return <PositioningSection stockCode={stockCode} />;
    }
    if (activeTab === 'thesis' && stockCode) {
      return <ThesisTab stockCode={stockCode} stockName={stockName} />;
    }
    if (activeTab === 'forward-metrics' && stockCode) {
      return <ForwardMetricsTab stockCode={stockCode} stockName={stockName} />;
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="stock-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="stock-modal" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <DrawerHeader stockName={stockName} stockCode={stockCode} onClose={onClose} positioning={positioning} />
        <DrawerTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="stock-modal-content">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
