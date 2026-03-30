'use client';

import React, { useState } from 'react';
import { PEMonitoring, GuidanceVsActual, UpdatePEMonitoringRequest } from '../../../../types/pe';

interface MonitoringTabProps {
  companyId: string;
  monitoring: PEMonitoring | null;
  onMonitoringUpdated: (monitoring: PEMonitoring) => void;
}

const GUIDANCE_OPTIONS: { value: GuidanceVsActual; label: string; color: string }[] = [
  { value: 'ahead', label: 'Ahead', color: 'var(--positive-color)' },
  { value: 'on_track', label: 'On Track', color: 'var(--accent-color)' },
  { value: 'behind', label: 'Behind', color: 'var(--warning-color)' },
  { value: 'missed', label: 'Missed', color: 'var(--negative-color)' },
];

export function MonitoringTab({ companyId, monitoring, onMonitoringUpdated }: MonitoringTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<UpdatePEMonitoringRequest>({
    latestEarningsUpdate: monitoring?.latestEarningsUpdate || '',
    latestEarningsDate: monitoring?.latestEarningsDate || null,
    managementGuidance: monitoring?.managementGuidance || '',
    guidanceVsActual: monitoring?.guidanceVsActual || null,
    guidanceVsActualNotes: monitoring?.guidanceVsActualNotes || '',
    fy26AnnualReportReceived: monitoring?.fy26AnnualReportReceived || false,
    fy26AnnualReportDate: monitoring?.fy26AnnualReportDate || null,
    lastAuditedFinancialsReceived: monitoring?.lastAuditedFinancialsReceived || null,
    latestDeckReceived: monitoring?.latestDeckReceived || null,
    latestDeckName: monitoring?.latestDeckName || '',
  });

  const handleEdit = () => {
    setFormData({
      latestEarningsUpdate: monitoring?.latestEarningsUpdate || '',
      latestEarningsDate: monitoring?.latestEarningsDate?.split('T')[0] || null,
      managementGuidance: monitoring?.managementGuidance || '',
      guidanceVsActual: monitoring?.guidanceVsActual || null,
      guidanceVsActualNotes: monitoring?.guidanceVsActualNotes || '',
      fy26AnnualReportReceived: monitoring?.fy26AnnualReportReceived || false,
      fy26AnnualReportDate: monitoring?.fy26AnnualReportDate?.split('T')[0] || null,
      lastAuditedFinancialsReceived: monitoring?.lastAuditedFinancialsReceived?.split('T')[0] || null,
      latestDeckReceived: monitoring?.latestDeckReceived?.split('T')[0] || null,
      latestDeckName: monitoring?.latestDeckName || '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/monitoring`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to save');

      const data = await response.json();
      onMonitoringUpdated(data.monitoring);
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving monitoring:', err);
      alert('Failed to save monitoring data');
    } finally {
      setIsSaving(false);
    }
  };

  const getGuidanceClass = (value: GuidanceVsActual | null) => {
    switch (value) {
      case 'ahead':
        return 'pe-guidance-ahead';
      case 'on_track':
        return 'pe-guidance-on-track';
      case 'behind':
        return 'pe-guidance-behind';
      case 'missed':
        return 'pe-guidance-missed';
      default:
        return '';
    }
  };

  if (isEditing) {
    return (
      <div className="pe-monitoring-edit">
        <div className="pe-section">
          <h3>Earnings Update</h3>
          <div className="pe-form-group">
            <label>Latest Earnings Summary</label>
            <textarea
              value={formData.latestEarningsUpdate || ''}
              onChange={e => setFormData(prev => ({ ...prev, latestEarningsUpdate: e.target.value }))}
              placeholder="Summary of latest earnings..."
              rows={3}
            />
          </div>
          <div className="pe-form-group">
            <label>Earnings Date</label>
            <input
              type="date"
              value={formData.latestEarningsDate || ''}
              onChange={e => setFormData(prev => ({ ...prev, latestEarningsDate: e.target.value || null }))}
            />
          </div>
        </div>

        <div className="pe-section">
          <h3>Management Guidance</h3>
          <div className="pe-form-group">
            <label>Guidance Summary</label>
            <textarea
              value={formData.managementGuidance || ''}
              onChange={e => setFormData(prev => ({ ...prev, managementGuidance: e.target.value }))}
              placeholder="Management guidance and targets..."
              rows={3}
            />
          </div>
          <div className="pe-form-group">
            <label>Guidance vs Actual</label>
            <div className="pe-guidance-selector">
              {GUIDANCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`pe-guidance-option ${formData.guidanceVsActual === opt.value ? 'selected' : ''}`}
                  style={{ '--guidance-color': opt.color } as React.CSSProperties}
                  onClick={() => setFormData(prev => ({ ...prev, guidanceVsActual: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                className={`pe-guidance-option ${!formData.guidanceVsActual ? 'selected' : ''}`}
                onClick={() => setFormData(prev => ({ ...prev, guidanceVsActual: null }))}
              >
                Not Set
              </button>
            </div>
          </div>
          <div className="pe-form-group">
            <label>Notes</label>
            <textarea
              value={formData.guidanceVsActualNotes || ''}
              onChange={e => setFormData(prev => ({ ...prev, guidanceVsActualNotes: e.target.value }))}
              placeholder="Additional notes on guidance vs actual..."
              rows={2}
            />
          </div>
        </div>

        <div className="pe-section">
          <h3>Documents Received</h3>
          <div className="pe-form-row">
            <div className="pe-checkbox-group">
              <input
                type="checkbox"
                id="fy26Report"
                checked={formData.fy26AnnualReportReceived || false}
                onChange={e => setFormData(prev => ({ ...prev, fy26AnnualReportReceived: e.target.checked }))}
              />
              <label htmlFor="fy26Report">FY26 Annual Report Received</label>
            </div>
            {formData.fy26AnnualReportReceived && (
              <input
                type="date"
                value={formData.fy26AnnualReportDate || ''}
                onChange={e => setFormData(prev => ({ ...prev, fy26AnnualReportDate: e.target.value || null }))}
                placeholder="Received date"
              />
            )}
          </div>
          <div className="pe-form-group">
            <label>Last Audited Financials Received</label>
            <input
              type="date"
              value={formData.lastAuditedFinancialsReceived || ''}
              onChange={e => setFormData(prev => ({ ...prev, lastAuditedFinancialsReceived: e.target.value || null }))}
            />
          </div>
          <div className="pe-form-row">
            <div className="pe-form-group">
              <label>Latest Deck Received</label>
              <input
                type="date"
                value={formData.latestDeckReceived || ''}
                onChange={e => setFormData(prev => ({ ...prev, latestDeckReceived: e.target.value || null }))}
              />
            </div>
            <div className="pe-form-group">
              <label>Deck Name</label>
              <input
                type="text"
                value={formData.latestDeckName || ''}
                onChange={e => setFormData(prev => ({ ...prev, latestDeckName: e.target.value }))}
                placeholder="e.g., Q4 FY26 Investor Deck"
              />
            </div>
          </div>
        </div>

        <div className="pe-form-actions">
          <button
            type="button"
            className="pe-btn-secondary"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pe-btn-primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pe-monitoring-view">
      <div className="pe-section-header">
        <h3>Monitoring</h3>
        <button className="pe-edit-btn" onClick={handleEdit} type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit
        </button>
      </div>

      {/* Earnings Update */}
      <div className="pe-monitoring-section">
        <h4>Latest Earnings Update</h4>
        {monitoring?.latestEarningsUpdate ? (
          <>
            <p className="pe-monitoring-text">{monitoring.latestEarningsUpdate}</p>
            {monitoring.latestEarningsDate && (
              <span className="pe-monitoring-date">
                As of {new Date(monitoring.latestEarningsDate).toLocaleDateString()}
              </span>
            )}
          </>
        ) : (
          <p className="pe-muted">No earnings update recorded</p>
        )}
      </div>

      {/* Management Guidance */}
      <div className="pe-monitoring-section">
        <h4>Management Guidance</h4>
        {monitoring?.managementGuidance ? (
          <p className="pe-monitoring-text">{monitoring.managementGuidance}</p>
        ) : (
          <p className="pe-muted">No guidance recorded</p>
        )}

        {monitoring?.guidanceVsActual && (
          <div className="pe-guidance-status">
            <span>Status:</span>
            <span className={`pe-guidance-badge ${getGuidanceClass(monitoring.guidanceVsActual)}`}>
              {GUIDANCE_OPTIONS.find(o => o.value === monitoring.guidanceVsActual)?.label || monitoring.guidanceVsActual}
            </span>
          </div>
        )}

        {monitoring?.guidanceVsActualNotes && (
          <p className="pe-monitoring-notes">{monitoring.guidanceVsActualNotes}</p>
        )}
      </div>

      {/* Documents Checklist */}
      <div className="pe-monitoring-section">
        <h4>Documents Received</h4>
        <div className="pe-documents-checklist">
          <div className={`pe-document-item ${monitoring?.fy26AnnualReportReceived ? 'received' : ''}`}>
            <span className="pe-document-check">
              {monitoring?.fy26AnnualReportReceived ? '✓' : '○'}
            </span>
            <span className="pe-document-label">FY26 Annual Report</span>
            {monitoring?.fy26AnnualReportDate && (
              <span className="pe-document-date">
                {new Date(monitoring.fy26AnnualReportDate).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className={`pe-document-item ${monitoring?.lastAuditedFinancialsReceived ? 'received' : ''}`}>
            <span className="pe-document-check">
              {monitoring?.lastAuditedFinancialsReceived ? '✓' : '○'}
            </span>
            <span className="pe-document-label">Last Audited Financials</span>
            {monitoring?.lastAuditedFinancialsReceived && (
              <span className="pe-document-date">
                {new Date(monitoring.lastAuditedFinancialsReceived).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className={`pe-document-item ${monitoring?.latestDeckReceived ? 'received' : ''}`}>
            <span className="pe-document-check">
              {monitoring?.latestDeckReceived ? '✓' : '○'}
            </span>
            <span className="pe-document-label">
              Latest Deck
              {monitoring?.latestDeckName && `: ${monitoring.latestDeckName}`}
            </span>
            {monitoring?.latestDeckReceived && (
              <span className="pe-document-date">
                {new Date(monitoring.latestDeckReceived).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
