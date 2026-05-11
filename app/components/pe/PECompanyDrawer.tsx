'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { DrawerTabs, DrawerTab } from '../drawer/DrawerTabs';
import { OverviewTab } from './tabs/OverviewTab';
import { ThesisTab } from './tabs/ThesisTab';
import { ValuationTab } from './tabs/ValuationTab';
import { ContactsTab } from './tabs/ContactsTab';
import { PECompany, PEMetrics } from '../../../types/pe';
import './pe.css';

interface PECompanyDrawerProps {
  isOpen: boolean;
  companyId: string | null;
  onClose: () => void;
  onCompanyUpdated?: () => void;
}

const TABS: DrawerTab[] = [
  { id: 'overview', label: 'Overview', enabled: true },
  { id: 'thesis', label: 'Thesis', enabled: true },
  { id: 'valuation', label: 'Valuation', enabled: true },
  { id: 'contacts', label: 'Contacts', enabled: true },
];

export function PECompanyDrawer({
  isOpen,
  companyId,
  onClose,
  onCompanyUpdated,
}: PECompanyDrawerProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [company, setCompany] = useState<PECompany | null>(null);
  const [metrics, setMetrics] = useState<PEMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanyData = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/pe/companies/${id}`);
      if (!response.ok) throw new Error('Failed to fetch company data');
      const data = await response.json();
      setCompany(data.company);
      setMetrics(data.metrics);
    } catch (err) {
      console.error('Error fetching company data:', err);
      setError('Failed to load company data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && companyId) {
      fetchCompanyData(companyId);
      setActiveTab('overview');
    }
  }, [isOpen, companyId, fetchCompanyData]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleCompanyUpdated = (updatedCompany: PECompany, updatedMetrics?: PEMetrics) => {
    setCompany(updatedCompany);
    if (updatedMetrics) setMetrics(updatedMetrics);
    onCompanyUpdated?.();
  };

  if (!isOpen) return null;

  const renderContent = () => {
    if (isLoading) return <div className="pe-drawer-loading">Loading...</div>;
    if (error) return <div className="pe-drawer-error">{error}</div>;
    if (!company) return <div className="pe-drawer-error">Company not found</div>;

    switch (activeTab) {
      case 'overview':
        return (
          <OverviewTab
            companyId={company.id}
            company={company}
            metrics={metrics}
            onCompanyUpdated={handleCompanyUpdated}
          />
        );
      case 'thesis':
        return (
          <ThesisTab
            companyId={company.id}
            company={company}
            onCompanyUpdated={handleCompanyUpdated}
          />
        );
      case 'valuation':
        return <ValuationTab companyId={company.id} />;
      case 'contacts':
        return <ContactsTab companyId={company.id} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="stock-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="stock-modal" role="dialog" aria-modal="true" aria-labelledby="pe-drawer-title">
        <div className="pe-drawer-header">
          <div className="pe-drawer-header-content">
            <h2 id="pe-drawer-title" className="pe-drawer-title">
              {company?.companyName || 'Loading...'}
            </h2>
            {company?.companyCode && (
              <span className="pe-drawer-code">{company.companyCode}</span>
            )}
          </div>
          <button
            className="pe-drawer-close"
            onClick={onClose}
            aria-label="Close drawer"
            type="button"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <DrawerTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="stock-modal-content">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
