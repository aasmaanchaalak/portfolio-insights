'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { DrawerTabs, DrawerTab } from '../drawer/DrawerTabs';
import { OverviewTab } from './tabs/OverviewTab';
import { ThesisTab } from './tabs/ThesisTab';
import { MonitoringTab } from './tabs/MonitoringTab';
import { ContactsTab } from './tabs/ContactsTab';
import { CommunicationsTab } from './tabs/CommunicationsTab';
import {
  PECompany,
  PEInvestment,
  PEThesis,
  PEThesisBreakCondition,
  PEMonitoring,
  PEMetrics,
} from '../../../types/pe';
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
  { id: 'monitoring', label: 'Monitoring', enabled: true },
  { id: 'valuation', label: 'Valuation', enabled: false },
  { id: 'contacts', label: 'Contacts', enabled: true },
  { id: 'communications', label: 'Communications', enabled: true },
];

export function PECompanyDrawer({
  isOpen,
  companyId,
  onClose,
  onCompanyUpdated,
}: PECompanyDrawerProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [company, setCompany] = useState<PECompany | null>(null);
  const [investment, setInvestment] = useState<PEInvestment | null>(null);
  const [thesis, setThesis] = useState<PEThesis | null>(null);
  const [monitoring, setMonitoring] = useState<PEMonitoring | null>(null);
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
      setInvestment(data.investment);
      setThesis(data.thesis);
      setMonitoring(data.monitoring);
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

  const handleInvestmentUpdated = (updatedInvestment: PEInvestment, updatedMetrics: PEMetrics) => {
    setInvestment(updatedInvestment);
    setMetrics(updatedMetrics);
    onCompanyUpdated?.();
  };

  const handleThesisUpdated = (updatedThesis: PEThesis) => {
    setThesis(updatedThesis);
    onCompanyUpdated?.();
  };

  const handleMonitoringUpdated = (updatedMonitoring: PEMonitoring) => {
    setMonitoring(updatedMonitoring);
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className="pe-drawer-loading">Loading...</div>;
    }

    if (error) {
      return <div className="pe-drawer-error">{error}</div>;
    }

    if (!company) {
      return <div className="pe-drawer-error">Company not found</div>;
    }

    switch (activeTab) {
      case 'overview':
        return (
          <OverviewTab
            companyId={company.id}
            investment={investment}
            metrics={metrics}
            onInvestmentUpdated={handleInvestmentUpdated}
          />
        );
      case 'thesis':
        return (
          <ThesisTab
            companyId={company.id}
            thesis={thesis}
            onThesisUpdated={handleThesisUpdated}
          />
        );
      case 'monitoring':
        return (
          <MonitoringTab
            companyId={company.id}
            monitoring={monitoring}
            onMonitoringUpdated={handleMonitoringUpdated}
          />
        );
      case 'contacts':
        return <ContactsTab companyId={company.id} />;
      case 'communications':
        return <CommunicationsTab companyId={company.id} />;
      default:
        return (
          <div className="pe-coming-soon">
            <div className="coming-soon-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3>Coming Soon</h3>
            <p>This feature is under development.</p>
          </div>
        );
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`pe-drawer-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`pe-drawer ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pe-drawer-title"
      >
        {/* Header */}
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

        {/* Tabs */}
        <DrawerTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Content */}
        <div className="pe-drawer-content">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
