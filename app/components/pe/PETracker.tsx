'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { PECompanyDrawer } from './PECompanyDrawer';
import { PECompanyListItem } from '../../../types/pe';
import { formatCurrency, formatMOIC } from '../../../lib/pe/calculations';
import './pe.css';

interface PETrackerProps {
  onBack?: () => void;
}

type SortKey =
  | 'companyName'
  | 'sector'
  | 'investedValue'
  | 'currentValue'
  | 'moic'
  | 'thesisStatus'
  | 'brokerName'
  | 'drhpFiled'
  | 'fy26AnnualReportReceived'
  | 'fy25AnnualReportReceived'
  | 'lastCommunicationDate';

type SortDirection = 'asc' | 'desc';

export function PETracker({ onBack }: PETrackerProps) {
  const [companies, setCompanies] = useState<PECompanyListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [thesisFilter, setThesisFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
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
        isExited: false,
        exitDate: null,
        exitValue: null,
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';

  const sectors = useMemo(
    () =>
      Array.from(new Set(companies.map(c => c.sector).filter((s): s is string => !!s))).sort(),
    [companies]
  );

  const { visibleActive, visibleExited } = useMemo(() => {
    let result = companies;

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(c =>
        c.companyName.toLowerCase().includes(query) ||
        c.companyCode.toLowerCase().includes(query) ||
        (c.sector || '').toLowerCase().includes(query) ||
        (c.brokerName || '').toLowerCase().includes(query)
      );
    }

    if (sectorFilter !== 'all') {
      result = result.filter(c => c.sector === sectorFilter);
    }

    if (thesisFilter !== 'all') {
      result = result.filter(c =>
        thesisFilter === 'none' ? !c.thesisStatus : c.thesisStatus === thesisFilter
      );
    }

    const sortList = (list: PECompanyListItem[]) => {
      if (!sortKey) return list;
      const direction = sortDirection === 'asc' ? 1 : -1;
      return [...list].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        // Missing values always sort last regardless of direction
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return (aVal - bVal) * direction;
        }
        if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
          return (Number(aVal) - Number(bVal)) * direction;
        }
        if (sortKey === 'lastCommunicationDate') {
          return (new Date(aVal as string).getTime() - new Date(bVal as string).getTime()) * direction;
        }
        return String(aVal).localeCompare(String(bVal)) * direction;
      });
    };

    const exited = result.filter(c => c.isExited);
    const exitedSorted = sortKey
      ? sortList(exited)
      : [...exited].sort((a, b) => {
          if (!a.exitDate && !b.exitDate) return 0;
          if (!a.exitDate) return 1;
          if (!b.exitDate) return -1;
          return new Date(b.exitDate).getTime() - new Date(a.exitDate).getTime();
        });

    return {
      visibleActive: sortList(result.filter(c => !c.isExited)),
      visibleExited: exitedSorted,
    };
  }, [companies, searchQuery, sectorFilter, thesisFilter, sortKey, sortDirection]);

  const hasActiveFilters =
    searchQuery.trim() !== '' || sectorFilter !== 'all' || thesisFilter !== 'all';

  // Calculate portfolio summary (active holdings only)
  const activeCompanies = companies.filter(c => !c.isExited);
  const exitedCompanies = companies.filter(c => c.isExited);

  const portfolioSummary = activeCompanies.reduce(
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

  const totalRealizedValue = exitedCompanies.reduce(
    (sum, c) => sum + (c.exitValue || 0),
    0
  );

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
          <span className="pe-summary-value">{activeCompanies.length}</span>
        </div>
        {exitedCompanies.length > 0 && (
          <div className="pe-summary-card">
            <span className="pe-summary-label">Realized (Exited)</span>
            <span className="pe-summary-value">{formatCurrency(totalRealizedValue)}</span>
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="pe-toolbar">
        <input
          type="text"
          className="pe-search-input"
          placeholder="Search company, code, sector, broker..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <select
          className="pe-filter-select"
          value={sectorFilter}
          onChange={e => setSectorFilter(e.target.value)}
        >
          <option value="all">All Sectors</option>
          {sectors.map(sector => (
            <option key={sector} value={sector}>{sector}</option>
          ))}
        </select>
        <select
          className="pe-filter-select"
          value={thesisFilter}
          onChange={e => setThesisFilter(e.target.value)}
        >
          <option value="all">All Thesis Status</option>
          <option value="intact">Intact</option>
          <option value="monitor">Monitor</option>
          <option value="broken">Broken</option>
          <option value="none">Not Set</option>
        </select>
        {hasActiveFilters && (
          <button
            type="button"
            className="pe-clear-filters-btn"
            onClick={() => {
              setSearchQuery('');
              setSectorFilter('all');
              setThesisFilter('all');
            }}
          >
            Clear
          </button>
        )}
        <span className="pe-toolbar-count">
          {visibleActive.length + visibleExited.length} of {companies.length}
        </span>
      </div>

      {/* Companies Table */}
      <div className="pe-table-container">
        <table className="pe-table">
          <thead>
            <tr>
              <th className="pe-th-sortable" onClick={() => handleSort('companyName')}>
                Company{sortIndicator('companyName')}
              </th>
              <th className="pe-th-sortable" onClick={() => handleSort('sector')}>
                Sector{sortIndicator('sector')}
              </th>
              <th className="pe-col-right pe-th-sortable" onClick={() => handleSort('investedValue')}>
                Invested{sortIndicator('investedValue')}
              </th>
              <th className="pe-col-right pe-th-sortable" onClick={() => handleSort('currentValue')}>
                Current Value{sortIndicator('currentValue')}
              </th>
              <th className="pe-col-right pe-th-sortable" onClick={() => handleSort('moic')}>
                MOIC{sortIndicator('moic')}
              </th>
              <th className="pe-col-center pe-th-sortable" onClick={() => handleSort('thesisStatus')}>
                Thesis{sortIndicator('thesisStatus')}
              </th>
              <th className="pe-th-sortable" onClick={() => handleSort('brokerName')}>
                Broker{sortIndicator('brokerName')}
              </th>
              <th className="pe-col-center pe-th-sortable" onClick={() => handleSort('drhpFiled')}>
                DRHP{sortIndicator('drhpFiled')}
              </th>
              <th className="pe-col-center pe-th-sortable" onClick={() => handleSort('fy26AnnualReportReceived')}>
                FY26 AR{sortIndicator('fy26AnnualReportReceived')}
              </th>
              <th className="pe-col-center pe-th-sortable" onClick={() => handleSort('fy25AnnualReportReceived')}>
                FY25 AR{sortIndicator('fy25AnnualReportReceived')}
              </th>
              <th className="pe-th-sortable" onClick={() => handleSort('lastCommunicationDate')}>
                Last Contact{sortIndicator('lastCommunicationDate')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleActive.length === 0 ? (
              <tr>
                <td colSpan={11} className="pe-empty">
                  {companies.length === 0
                    ? 'No PE companies yet. Click "Add Company" to get started.'
                    : 'No active companies match the current search / filters.'}
                </td>
              </tr>
            ) : (
              visibleActive.map(company => (
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

      {/* Exited / Sold Companies */}
      {visibleExited.length > 0 && (
        <div className="pe-exited-section">
          <h2 className="pe-exited-title">Exited / Sold ({visibleExited.length})</h2>
          <div className="pe-table-container">
            <table className="pe-table pe-table-exited">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Sector</th>
                  <th className="pe-col-right">Invested</th>
                  <th className="pe-col-right">Exit Value</th>
                  <th className="pe-col-right">Realized MOIC</th>
                  <th>Exit Date</th>
                  <th>Broker</th>
                </tr>
              </thead>
              <tbody>
                {visibleExited.map(company => (
                  <tr
                    key={company.id}
                    onClick={() => setSelectedCompanyId(company.id)}
                    className="pe-table-row"
                  >
                    <td>
                      <div className="pe-company-cell">
                        <span className="pe-company-name">
                          {company.companyName}
                          <span className="pe-exited-badge">Sold</span>
                        </span>
                        <span className="pe-company-code">{company.companyCode}</span>
                      </div>
                    </td>
                    <td className="pe-sector">{company.sector || '-'}</td>
                    <td className="pe-col-right">{formatCurrency(company.investedValue)}</td>
                    <td className="pe-col-right">{formatCurrency(company.exitValue)}</td>
                    <td className="pe-col-right">{formatMOIC(company.moic)}</td>
                    <td className="pe-date">
                      {company.exitDate ? new Date(company.exitDate).toLocaleDateString() : '-'}
                    </td>
                    <td>{company.brokerName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
