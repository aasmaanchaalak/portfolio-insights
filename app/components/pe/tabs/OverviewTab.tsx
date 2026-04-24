'use client';

import React, { useState } from 'react';
import { AttachmentSection } from '../../shared/AttachmentSection';
import {
  PECompany,
  PEMetrics,
  GuidanceVsActual,
  UpdatePEInvestmentRequest,
  UpdatePEMonitoringRequest,
} from '../../../../types/pe';
import {
  formatCurrency,
  formatMOIC,
  formatIRR,
  formatPercentage,
  formatOwnership,
} from '../../../../lib/pe/calculations';

const GUIDANCE_OPTIONS: { value: GuidanceVsActual; label: string; color: string }[] = [
  { value: 'ahead', label: 'Ahead', color: 'var(--positive-color)' },
  { value: 'on_track', label: 'On Track', color: 'var(--accent-color)' },
  { value: 'behind', label: 'Behind', color: 'var(--warning-color)' },
  { value: 'missed', label: 'Missed', color: 'var(--negative-color)' },
];

interface OverviewTabProps {
  companyId: string;
  company: PECompany | null;
  metrics: PEMetrics | null;
  onCompanyUpdated: (company: PECompany, metrics?: PEMetrics) => void;
}

export function OverviewTab({ companyId, company, metrics, onCompanyUpdated }: OverviewTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingMonitoring, setIsEditingMonitoring] = useState(false);
  const [isSavingMonitoring, setIsSavingMonitoring] = useState(false);

  const [formData, setFormData] = useState<UpdatePEInvestmentRequest>({
    investedValue: company?.investedValue || 0,
    currentValue: company?.currentValue || null,
    pricePerShare: company?.pricePerShare || null,
    quantityHeld: company?.quantityHeld || null,
    ownershipPercentage: company?.ownershipPercentage || null,
    investmentDate: company?.investmentDate || null,
    investmentValuation: company?.investmentValuation || null,
    currency: company?.currency || 'INR',
  });

  const [monitoringForm, setMonitoringForm] = useState<UpdatePEMonitoringRequest>({
    latestEarningsUpdate: company?.latestEarningsUpdate || '',
    latestEarningsDate: company?.latestEarningsDate || null,
    managementGuidance: company?.managementGuidance || '',
    guidanceVsActual: company?.guidanceVsActual || null,
    guidanceVsActualNotes: company?.guidanceVsActualNotes || '',
    fy26AnnualReportReceived: company?.fy26AnnualReportReceived || false,
    fy26AnnualReportDate: company?.fy26AnnualReportDate || null,
    lastAuditedFinancialsReceived: company?.lastAuditedFinancialsReceived || null,
    latestDeckReceived: company?.latestDeckReceived || null,
    latestDeckName: company?.latestDeckName || '',
  });

  const handleEdit = () => {
    setFormData({
      investedValue: company?.investedValue || 0,
      currentValue: company?.currentValue || null,
      pricePerShare: company?.pricePerShare || null,
      quantityHeld: company?.quantityHeld || null,
      ownershipPercentage: company?.ownershipPercentage || null,
      investmentDate: company?.investmentDate?.split('T')[0] || null,
      investmentValuation: company?.investmentValuation || null,
      currency: company?.currency || 'INR',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/overview`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error('Failed to save');
      const data = await response.json();
      onCompanyUpdated(data.company, data.metrics);
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving investment:', err);
      alert('Failed to save investment data');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditMonitoring = () => {
    setMonitoringForm({
      latestEarningsUpdate: company?.latestEarningsUpdate || '',
      latestEarningsDate: company?.latestEarningsDate?.split('T')[0] || null,
      managementGuidance: company?.managementGuidance || '',
      guidanceVsActual: company?.guidanceVsActual || null,
      guidanceVsActualNotes: company?.guidanceVsActualNotes || '',
      fy26AnnualReportReceived: company?.fy26AnnualReportReceived || false,
      fy26AnnualReportDate: company?.fy26AnnualReportDate?.split('T')[0] || null,
      lastAuditedFinancialsReceived: company?.lastAuditedFinancialsReceived?.split('T')[0] || null,
      latestDeckReceived: company?.latestDeckReceived?.split('T')[0] || null,
      latestDeckName: company?.latestDeckName || '',
    });
    setIsEditingMonitoring(true);
  };

  const handleSaveMonitoring = async () => {
    setIsSavingMonitoring(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/monitoring`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(monitoringForm),
      });
      if (!response.ok) throw new Error('Failed to save');
      const data = await response.json();
      onCompanyUpdated(data.company);
      setIsEditingMonitoring(false);
    } catch (err) {
      console.error('Error saving monitoring:', err);
      alert('Failed to save monitoring data');
    } finally {
      setIsSavingMonitoring(false);
    }
  };

  const getGuidanceClass = (value: GuidanceVsActual | null) => {
    switch (value) {
      case 'ahead': return 'pe-guidance-ahead';
      case 'on_track': return 'pe-guidance-on-track';
      case 'behind': return 'pe-guidance-behind';
      case 'missed': return 'pe-guidance-missed';
      default: return '';
    }
  };

  return (
    <div className="pe-overview-tab">
      {/* Metrics Cards */}
      <div className="pe-metrics-grid">
        <div className="pe-metric-card pe-metric-primary">
          <span className="pe-metric-label">Invested Value</span>
          <span className="pe-metric-value">{formatCurrency(company?.investedValue || null)}</span>
        </div>
        <div className="pe-metric-card pe-metric-primary">
          <span className="pe-metric-label">Current Value</span>
          <span className="pe-metric-value">{formatCurrency(company?.currentValue || null)}</span>
        </div>
        <div className="pe-metric-card">
          <span className="pe-metric-label">MOIC</span>
          <span className="pe-metric-value pe-metric-highlight">{formatMOIC(metrics?.moic || null)}</span>
        </div>
        <div className="pe-metric-card">
          <span className="pe-metric-label">IRR</span>
          <span className="pe-metric-value pe-metric-highlight">{formatIRR(metrics?.irr || null)}</span>
        </div>
      </div>

      {/* Gain/Loss */}
      {metrics && metrics.totalGainLoss != null && (
        <div className={`pe-gain-loss ${metrics.totalGainLoss >= 0 ? 'positive' : 'negative'}`}>
          <span className="pe-gain-loss-label">Total Gain/Loss</span>
          <span className="pe-gain-loss-value">
            {formatCurrency(metrics.totalGainLoss)} ({formatPercentage(metrics.totalGainLossPercentage)})
          </span>
        </div>
      )}

      {/* Investment Details */}
      <div className="pe-section">
        <div className="pe-section-header">
          <h3>Investment Details</h3>
          {!isEditing && (
            <button className="pe-edit-btn" onClick={handleEdit} type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="pe-edit-form">
            <div className="pe-form-grid">
              <div className="pe-form-group">
                <label>Invested Value *</label>
                <input type="number" value={formData.investedValue || ''} onChange={e => setFormData(prev => ({ ...prev, investedValue: parseFloat(e.target.value) || 0 }))} required />
              </div>
              <div className="pe-form-group">
                <label>Current Value</label>
                <input type="number" value={formData.currentValue || ''} onChange={e => setFormData(prev => ({ ...prev, currentValue: parseFloat(e.target.value) || null }))} />
              </div>
              <div className="pe-form-group">
                <label>Price per Share</label>
                <input type="number" step="0.0001" value={formData.pricePerShare || ''} onChange={e => setFormData(prev => ({ ...prev, pricePerShare: parseFloat(e.target.value) || null }))} />
              </div>
              <div className="pe-form-group">
                <label>Quantity Held</label>
                <input type="number" step="0.0001" value={formData.quantityHeld || ''} onChange={e => setFormData(prev => ({ ...prev, quantityHeld: parseFloat(e.target.value) || null }))} />
              </div>
              <div className="pe-form-group">
                <label>Ownership %</label>
                <input type="number" step="0.01" value={formData.ownershipPercentage || ''} onChange={e => setFormData(prev => ({ ...prev, ownershipPercentage: parseFloat(e.target.value) || null }))} />
              </div>
              <div className="pe-form-group">
                <label>Investment Date</label>
                <input type="date" value={formData.investmentDate || ''} onChange={e => setFormData(prev => ({ ...prev, investmentDate: e.target.value || null }))} />
              </div>
              <div className="pe-form-group">
                <label>Investment Valuation</label>
                <input type="number" value={formData.investmentValuation || ''} onChange={e => setFormData(prev => ({ ...prev, investmentValuation: parseFloat(e.target.value) || null }))} placeholder="e.g., 500000000" />
              </div>
            </div>
            <div className="pe-form-actions">
              <button type="button" className="pe-btn-secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancel</button>
              <button type="button" className="pe-btn-primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        ) : (
          <div className="pe-details-grid">
            <div className="pe-detail-item">
              <span className="pe-detail-label">Price per Share</span>
              <span className="pe-detail-value">{company?.pricePerShare != null ? `₹${company.pricePerShare.toLocaleString()}` : '-'}</span>
            </div>
            <div className="pe-detail-item">
              <span className="pe-detail-label">Quantity Held</span>
              <span className="pe-detail-value">{company?.quantityHeld != null ? company.quantityHeld.toLocaleString() : '-'}</span>
            </div>
            <div className="pe-detail-item">
              <span className="pe-detail-label">Ownership</span>
              <span className="pe-detail-value">{formatOwnership(company?.ownershipPercentage || null)}</span>
            </div>
            <div className="pe-detail-item">
              <span className="pe-detail-label">Investment Date</span>
              <span className="pe-detail-value">{company?.investmentDate ? new Date(company.investmentDate).toLocaleDateString() : '-'}</span>
            </div>
            <div className="pe-detail-item">
              <span className="pe-detail-label">Investment Valuation</span>
              <span className="pe-detail-value">{company?.investmentValuation != null ? formatCurrency(company.investmentValuation) : '-'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Monitoring Section */}
      <div className="pe-section">
        {isEditingMonitoring ? (
          <div className="pe-monitoring-edit">
            <div className="pe-section-header"><h3>Monitoring</h3></div>
            <div className="pe-form-group">
              <label>Latest Earnings Summary</label>
              <textarea value={monitoringForm.latestEarningsUpdate || ''} onChange={e => setMonitoringForm(prev => ({ ...prev, latestEarningsUpdate: e.target.value }))} placeholder="Summary of latest earnings..." rows={3} />
            </div>
            <div className="pe-form-group">
              <label>Earnings Date</label>
              <input type="date" value={monitoringForm.latestEarningsDate || ''} onChange={e => setMonitoringForm(prev => ({ ...prev, latestEarningsDate: e.target.value || null }))} />
            </div>
            <div className="pe-form-group">
              <label>Guidance Summary</label>
              <textarea value={monitoringForm.managementGuidance || ''} onChange={e => setMonitoringForm(prev => ({ ...prev, managementGuidance: e.target.value }))} placeholder="Management guidance and targets..." rows={3} />
            </div>
            <div className="pe-form-group">
              <label>Guidance vs Actual</label>
              <div className="pe-guidance-selector">
                {GUIDANCE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    className={`pe-guidance-option ${monitoringForm.guidanceVsActual === opt.value ? 'selected' : ''}`}
                    style={{ '--guidance-color': opt.color } as React.CSSProperties}
                    onClick={() => setMonitoringForm(prev => ({ ...prev, guidanceVsActual: opt.value }))}>
                    {opt.label}
                  </button>
                ))}
                <button type="button" className={`pe-guidance-option ${!monitoringForm.guidanceVsActual ? 'selected' : ''}`} onClick={() => setMonitoringForm(prev => ({ ...prev, guidanceVsActual: null }))}>Not Set</button>
              </div>
            </div>
            <div className="pe-form-group">
              <label>Guidance Notes</label>
              <textarea value={monitoringForm.guidanceVsActualNotes || ''} onChange={e => setMonitoringForm(prev => ({ ...prev, guidanceVsActualNotes: e.target.value }))} rows={2} />
            </div>
            <div className="pe-form-group">
              <div className="pe-checkbox-group">
                <input type="checkbox" id="fy26Report" checked={monitoringForm.fy26AnnualReportReceived || false} onChange={e => setMonitoringForm(prev => ({ ...prev, fy26AnnualReportReceived: e.target.checked }))} />
                <label htmlFor="fy26Report">FY26 Annual Report Received</label>
              </div>
              {monitoringForm.fy26AnnualReportReceived && (
                <input type="date" value={monitoringForm.fy26AnnualReportDate || ''} onChange={e => setMonitoringForm(prev => ({ ...prev, fy26AnnualReportDate: e.target.value || null }))} />
              )}
            </div>
            <div className="pe-form-group">
              <label>Last Audited Financials Received</label>
              <input type="date" value={monitoringForm.lastAuditedFinancialsReceived || ''} onChange={e => setMonitoringForm(prev => ({ ...prev, lastAuditedFinancialsReceived: e.target.value || null }))} />
            </div>
            <div className="pe-form-row">
              <div className="pe-form-group">
                <label>Latest Deck Received</label>
                <input type="date" value={monitoringForm.latestDeckReceived || ''} onChange={e => setMonitoringForm(prev => ({ ...prev, latestDeckReceived: e.target.value || null }))} />
              </div>
              <div className="pe-form-group">
                <label>Deck Name</label>
                <input type="text" value={monitoringForm.latestDeckName || ''} onChange={e => setMonitoringForm(prev => ({ ...prev, latestDeckName: e.target.value }))} placeholder="e.g., Q4 FY26 Investor Deck" />
              </div>
            </div>
            <div className="pe-form-actions">
              <button type="button" className="pe-btn-secondary" onClick={() => setIsEditingMonitoring(false)} disabled={isSavingMonitoring}>Cancel</button>
              <button type="button" className="pe-btn-primary" onClick={handleSaveMonitoring} disabled={isSavingMonitoring}>{isSavingMonitoring ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        ) : (
          <div className="pe-monitoring-view">
            <div className="pe-section-header">
              <h3>Monitoring</h3>
              <button className="pe-edit-btn" onClick={handleEditMonitoring} type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
              </button>
            </div>

            <div className="pe-monitoring-section">
              <h4>Latest Earnings Update</h4>
              {company?.latestEarningsUpdate ? (
                <>
                  <p className="pe-monitoring-text">{company.latestEarningsUpdate}</p>
                  {company.latestEarningsDate && <span className="pe-monitoring-date">As of {new Date(company.latestEarningsDate).toLocaleDateString()}</span>}
                </>
              ) : <p className="pe-muted">No earnings update recorded</p>}
            </div>

            <div className="pe-monitoring-section">
              <h4>Management Guidance</h4>
              {company?.managementGuidance ? <p className="pe-monitoring-text">{company.managementGuidance}</p> : <p className="pe-muted">No guidance recorded</p>}
              {company?.guidanceVsActual && (
                <div className="pe-guidance-status">
                  <span>Status:</span>
                  <span className={`pe-guidance-badge ${getGuidanceClass(company.guidanceVsActual)}`}>
                    {GUIDANCE_OPTIONS.find(o => o.value === company.guidanceVsActual)?.label || company.guidanceVsActual}
                  </span>
                </div>
              )}
              {company?.guidanceVsActualNotes && <p className="pe-monitoring-notes">{company.guidanceVsActualNotes}</p>}
            </div>

            <div className="pe-monitoring-section">
              <h4>Documents Received</h4>
              <div className="pe-documents-checklist">
                <div className={`pe-document-item ${company?.fy26AnnualReportReceived ? 'received' : ''}`}>
                  <span className="pe-document-check">{company?.fy26AnnualReportReceived ? '✓' : '○'}</span>
                  <span className="pe-document-label">FY26 Annual Report</span>
                  {company?.fy26AnnualReportDate && <span className="pe-document-date">{new Date(company.fy26AnnualReportDate).toLocaleDateString()}</span>}
                </div>
                <div className={`pe-document-item ${company?.lastAuditedFinancialsReceived ? 'received' : ''}`}>
                  <span className="pe-document-check">{company?.lastAuditedFinancialsReceived ? '✓' : '○'}</span>
                  <span className="pe-document-label">Last Audited Financials</span>
                  {company?.lastAuditedFinancialsReceived && <span className="pe-document-date">{new Date(company.lastAuditedFinancialsReceived).toLocaleDateString()}</span>}
                </div>
                <div className={`pe-document-item ${company?.latestDeckReceived ? 'received' : ''}`}>
                  <span className="pe-document-check">{company?.latestDeckReceived ? '✓' : '○'}</span>
                  <span className="pe-document-label">Latest Deck{company?.latestDeckName && `: ${company.latestDeckName}`}</span>
                  {company?.latestDeckReceived && <span className="pe-document-date">{new Date(company.latestDeckReceived).toLocaleDateString()}</span>}
                </div>
              </div>
            </div>
          </div>
        )}
        <AttachmentSection module="pe" entityId={companyId} />
      </div>
    </div>
  );
}
