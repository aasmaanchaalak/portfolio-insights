'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { DrawerHeader } from './DrawerHeader';
import { DrawerTabs, DrawerTab } from './DrawerTabs';
import { ThesisTrackerCard } from '../thesis/ThesisTrackerCard';
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
  { id: 'forward-metrics', label: 'Forward Metrics', enabled: false },
  { id: 'valuation', label: 'Valuation', enabled: false },
  { id: 'risk', label: 'Risk', enabled: false },
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

  // Fetch thesis data when drawer opens
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

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Create a new thesis
  const handleCreateThesis = async (data: Omit<CreateThesisRequest, 'stockCode' | 'stockName'>) => {
    if (!stockCode) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockCode,
          stockName,
          ...data,
        }),
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
      console.error('Error creating thesis:', err);
      setError(err.message || 'Failed to create thesis');
    } finally {
      setIsSaving(false);
    }
  };

  // Update existing thesis
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
      console.error('Error updating thesis:', err);
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

    // Placeholder for future tabs
    return (
      <div className="drawer-coming-soon">
        <div className="coming-soon-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3>Coming Soon</h3>
        <p>This feature is under development.</p>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`stock-drawer-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`stock-drawer ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <DrawerHeader
          stockName={stockName}
          stockCode={stockCode}
          onClose={onClose}
        />

        <DrawerTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <div className="drawer-content">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
