'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { PECompanyDrawer } from './PECompanyDrawer';
import { PECompanyListItem } from '../../../types/pe';
import { formatCurrency, formatMOIC } from '../../../lib/pe/calculations';
import './pe.css';

interface PETrackerProps {
  onBack?: () => void;
}

export function PETracker({ onBack }: PETrackerProps) {
  const [companies, setCompanies] = useState<PECompanyListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCompany, setNewCompany] = useState({
    companyName: '',
    companyCode: '',
    sector: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await fetch('/api/pe/companies');
      if (!response.ok) throw new Error('Failed to fetch companies');
      const data = await response.json();
      setCompanies(data);
    } catch (err) {
      console.error('Error fetching PE companies:', err);
      setError('Failed to load companies');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.companyName || !newCompany.companyCode) return;

    setIsCreating(true);
    try {
      const response = await fetch('/api/pe/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCompany),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create company');
      }

      const company = await response.json();
      setCompanies(prev => [...prev, {
        ...company,
        investedValue: null,
        currentValue: null,
        moic: null,
        thesisStatus: null,
        lastCommunicationDate: null,
        brokerName: null,
        drhpFiled: false,
        fy26AnnualReportReceived: false,
        fy25AnnualReportReceived: false,
      }]);
      setShowAddModal(false);
      setNewCompany({ companyName: '', companyCode: '', sector: '' });
      setSelectedCompanyId(company.id);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCompanyUpdated = () => {
    fetchCompanies();
  };

  const getStatusBadgeClass = (status: string | null) => {
    switch (status) {
      case 'intact':
        return 'pe-status-intact';
      case 'monitor':
        return 'pe-status-monitor';
      case 'broken':
        return 'pe-status-broken';
      default:
        return 'pe-status-none';
    }
  };

  // Calculate portfolio summary
  const portfolioSummary = companies.reduce(
    (acc, company) => {
      if (company.investedValue) acc.totalInvested += company.investedValue;
      if (company.currentValue) acc.totalCurrentValue += company.currentValue;
      return acc;
    },
    { totalInvested: 0, totalCurrentValue: 0 }
  );

  const portfolioMOIC = portfolioSummary.totalInvested > 0
    ? portfolioSummary.totalCurrentValue / portfolioSummary.totalInvested
    : null;

  if (isLoading) {
    return (
      <div className="pe-tracker">
        <div className="pe-loading">Loading PE portfolio...</div>
      </div>
    );
  }

  return (
    <div className="pe-tracker">
      <div className="pe-header">
        <div className="pe-header-left">
          {onBack && (
            <button className="pe-back-btn" onClick={onBack} type="button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h1 className="pe-title">Private Equity Portfolio</h1>
        </div>
        <button
          className="pe-add-btn"
          onClick={() => setShowAddModal(true)}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Company
        </button>
      </div>

      {error && (
        <div className="pe-error">
          {error}
          <button onClick={() => setError(null)} type="button">Dismiss</button>
        </div>
      )}

      {/* Portfolio Summary */}
      <div className="pe-summary-cards">
        <div className="pe-summary-card">
          <span className="pe-summary-label">Total Invested</span>
          <span className="pe-summary-value">{formatCurrency(portfolioSummary.totalInvested)}</span>
        </div>
        <div className="pe-summary-card">
          <span className="pe-summary-label">Current Value</span>
          <span className="pe-summary-value">{formatCurrency(portfolioSummary.totalCurrentValue)}</span>
        </div>
        <div className="pe-summary-card">
          <span className="pe-summary-label">Portfolio MOIC</span>
          <span className="pe-summary-value">{formatMOIC(portfolioMOIC)}</span>
        </div>
        <div className="pe-summary-card">
          <span className="pe-summary-label">Companies</span>
          <span className="pe-summary-value">{companies.length}</span>
        </div>
      </div>

      {/* Companies Table */}
      <div className="pe-table-container">
        <table className="pe-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Sector</th>
              <th className="pe-col-right">Invested</th>
              <th className="pe-col-right">Current Value</th>
              <th className="pe-col-right">MOIC</th>
              <th className="pe-col-center">Thesis</th>
              <th>Broker</th>
              <th className="pe-col-center">DRHP</th>
              <th className="pe-col-center">FY26 AR</th>
              <th className="pe-col-center">FY25 AR</th>
              <th>Last Contact</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr>
                <td colSpan={11} className="pe-empty">
                  No PE companies yet. Click "Add Company" to get started.
                </td>
              </tr>
            ) : (
              companies.map(company => (
                <tr
                  key={company.id}
                  onClick={() => setSelectedCompanyId(company.id)}
                  className="pe-table-row"
                >
                  <td>
                    <div className="pe-company-cell">
                      <span className="pe-company-name">{company.companyName}</span>
                      <span className="pe-company-code">{company.companyCode}</span>
                    </div>
                  </td>
                  <td className="pe-sector">{company.sector || '-'}</td>
                  <td className="pe-col-right">{formatCurrency(company.investedValue)}</td>
                  <td className="pe-col-right">{formatCurrency(company.currentValue)}</td>
                  <td className="pe-col-right">{formatMOIC(company.moic)}</td>
                  <td className="pe-col-center">
                    <span className={`pe-status-badge ${getStatusBadgeClass(company.thesisStatus)}`}>
                      {company.thesisStatus || 'Not Set'}
                    </span>
                  </td>
                  <td>{company.brokerName || '-'}</td>
                  <td className="pe-col-center">{company.drhpFiled ? '✓' : '—'}</td>
                  <td className="pe-col-center">{company.fy26AnnualReportReceived ? '✓' : '—'}</td>
                  <td className="pe-col-center">{company.fy25AnnualReportReceived ? '✓' : '—'}</td>
                  <td className="pe-date">
                    {company.lastCommunicationDate
                      ? new Date(company.lastCommunicationDate).toLocaleDateString()
                      : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Company Modal */}
      {showAddModal && (
        <>
          <div className="pe-modal-backdrop" onClick={() => setShowAddModal(false)} />
          <div className="pe-modal">
            <div className="pe-modal-header">
              <h2>Add PE Company</h2>
              <button
                className="pe-modal-close"
                onClick={() => setShowAddModal(false)}
                type="button"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateCompany}>
              <div className="pe-form-group">
                <label htmlFor="companyName">Company Name *</label>
                <input
                  id="companyName"
                  type="text"
                  value={newCompany.companyName}
                  onChange={e => setNewCompany(prev => ({ ...prev, companyName: e.target.value }))}
                  placeholder="Enter company name"
                  required
                />
              </div>
              <div className="pe-form-group">
                <label htmlFor="companyCode">Company Code *</label>
                <input
                  id="companyCode"
                  type="text"
                  value={newCompany.companyCode}
                  onChange={e => setNewCompany(prev => ({ ...prev, companyCode: e.target.value.toUpperCase() }))}
                  placeholder="e.g., ABCD"
                  required
                />
              </div>
              <div className="pe-form-group">
                <label htmlFor="sector">Sector</label>
                <input
                  id="sector"
                  type="text"
                  value={newCompany.sector}
                  onChange={e => setNewCompany(prev => ({ ...prev, sector: e.target.value }))}
                  placeholder="e.g., Technology"
                />
              </div>
              <div className="pe-modal-actions">
                <button
                  type="button"
                  className="pe-btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pe-btn-primary"
                  disabled={isCreating || !newCompany.companyName || !newCompany.companyCode}
                >
                  {isCreating ? 'Creating...' : 'Add Company'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Company Detail Drawer */}
      <PECompanyDrawer
        isOpen={!!selectedCompanyId}
        companyId={selectedCompanyId}
        onClose={() => setSelectedCompanyId(null)}
        onCompanyUpdated={handleCompanyUpdated}
      />
    </div>
  );
}
