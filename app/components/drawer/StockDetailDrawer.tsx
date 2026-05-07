'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { DrawerHeader } from './DrawerHeader';
import { DrawerTabs, DrawerTab } from './DrawerTabs';
import { ThesisTrackerCard } from '../thesis/ThesisTrackerCard';
import { ForwardMetricsTab } from '../thesis/ForwardMetricsTab';
import { PositioningSection } from '../positioning/PositioningSection';
import {
  Thesis,
  ThesisHistoryEntry,
  ThesisResponse,
  CreateThesisRequest,
  UpdateThesisRequest,
} from '../../../types/thesis';
import './drawer.css';

interface StockDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stockCode: string | null;
  stockName: string;
}

const TABS: DrawerTab[] = [
  { id: 'thesis', label: 'Thesis', enabled: true },
  { id: 'forward-metrics', label: 'Forward Metrics', enabled: true },
];

export function StockDetailDrawer({
  isOpen,
  onClose,
  stockCode,
  stockName,
}: StockDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState('thesis');
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [recentHistory, setRecentHistory] = useState<ThesisHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchThesis = useCallback(async (code: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/thesis/${encodeURIComponent(code)}`);
      if (response.ok) {
        const data: ThesisResponse = await response.json();
        setThesis(data.thesis);
        setRecentHistory(data.recentHistory || []);
      } else if (response.status === 404) {
        setThesis(null);
        setRecentHistory([]);
      } else {
        throw new Error('Failed to fetch thesis');
      }
    } catch (err) {
      console.error('Error fetching thesis:', err);
      setError('Failed to load thesis data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && stockCode) {
      fetchThesis(stockCode);
    }
  }, [isOpen, stockCode, fetchThesis]);

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

  const handleCreateThesis = async (data: Omit<CreateThesisRequest, 'stockCode' | 'stockName'>) => {
    if (!stockCode) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockCode, stockName, ...data }),
      });
      if (response.ok) {
        const result = await response.json();
        setThesis(result.thesis);
        setRecentHistory([]);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create thesis');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create thesis');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateThesis = async (data: UpdateThesisRequest) => {
    if (!stockCode) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/thesis/${encodeURIComponent(stockCode)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        const result = await response.json();
        setThesis(result.thesis);
        setRecentHistory(result.recentHistory || []);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update thesis');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update thesis');
    } finally {
      setIsSaving(false);
    }
  };

  const renderContent = () => {
    if (activeTab === 'thesis') {
      return (
        <ThesisTrackerCard
          thesis={thesis}
          recentHistory={recentHistory}
          stockCode={stockCode || ''}
          stockName={stockName}
          isLoading={isLoading}
          isSaving={isSaving}
          error={error}
          onCreateThesis={handleCreateThesis}
          onUpdateThesis={handleUpdateThesis}
          onClearError={() => setError(null)}
        />
      );
    }
    if (activeTab === 'forward-metrics' && stockCode) {
      return <ForwardMetricsTab stockCode={stockCode} />;
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="stock-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="stock-modal" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <DrawerHeader stockName={stockName} stockCode={stockCode} onClose={onClose} />
        <div className="stock-modal-positioning">
          <PositioningSection stockCode={stockCode} />
        </div>
        <DrawerTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="stock-modal-content">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
