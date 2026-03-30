'use client';

import React, { useState } from 'react';
import {
  PEInvestment,
  PEMetrics,
  UpdatePEInvestmentRequest,
} from '../../../../types/pe';
import {
  formatCurrency,
  formatMOIC,
  formatIRR,
  formatPercentage,
  formatOwnership,
} from '../../../../lib/pe/calculations';

interface OverviewTabProps {
  companyId: string;
  investment: PEInvestment | null;
  metrics: PEMetrics | null;
  onInvestmentUpdated: (investment: PEInvestment, metrics: PEMetrics) => void;
}

export function OverviewTab({
  companyId,
  investment,
  metrics,
  onInvestmentUpdated,
}: OverviewTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<UpdatePEInvestmentRequest>({
    investedValue: investment?.investedValue || 0,
    currentValue: investment?.currentValue || null,
    pricePerShare: investment?.pricePerShare || null,
    quantityHeld: investment?.quantityHeld || null,
    ownershipPercentage: investment?.ownershipPercentage || null,
    investmentDate: investment?.investmentDate || null,
    lastValuationDate: investment?.lastValuationDate || null,
    valuationSource: investment?.valuationSource || null,
    currency: investment?.currency || 'INR',
  });

  const handleEdit = () => {
    setFormData({
      investedValue: investment?.investedValue || 0,
      currentValue: investment?.currentValue || null,
      pricePerShare: investment?.pricePerShare || null,
      quantityHeld: investment?.quantityHeld || null,
      ownershipPercentage: investment?.ownershipPercentage || null,
      investmentDate: investment?.investmentDate?.split('T')[0] || null,
      lastValuationDate: investment?.lastValuationDate?.split('T')[0] || null,
      valuationSource: investment?.valuationSource || null,
      currency: investment?.currency || 'INR',
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
      onInvestmentUpdated(data.investment, data.metrics);
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving investment:', err);
      alert('Failed to save investment data');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof UpdatePEInvestmentRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="pe-overview-tab">
      {/* Metrics Cards */}
      <div className="pe-metrics-grid">
        <div className="pe-metric-card pe-metric-primary">
          <span className="pe-metric-label">Invested Value</span>
          <span className="pe-metric-value">{formatCurrency(investment?.investedValue || null)}</span>
        </div>
        <div className="pe-metric-card pe-metric-primary">
          <span className="pe-metric-label">Current Value</span>
          <span className="pe-metric-value">{formatCurrency(investment?.currentValue || null)}</span>
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
                <input
                  type="number"
                  value={formData.investedValue || ''}
                  onChange={e => handleInputChange('investedValue', parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
              <div className="pe-form-group">
                <label>Current Value</label>
                <input
                  type="number"
                  value={formData.currentValue || ''}
                  onChange={e => handleInputChange('currentValue', parseFloat(e.target.value) || null)}
                />
              </div>
              <div className="pe-form-group">
                <label>Price per Share</label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.pricePerShare || ''}
                  onChange={e => handleInputChange('pricePerShare', parseFloat(e.target.value) || null)}
                />
              </div>
              <div className="pe-form-group">
                <label>Quantity Held</label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.quantityHeld || ''}
                  onChange={e => handleInputChange('quantityHeld', parseFloat(e.target.value) || null)}
                />
              </div>
              <div className="pe-form-group">
                <label>Ownership %</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.ownershipPercentage || ''}
                  onChange={e => handleInputChange('ownershipPercentage', parseFloat(e.target.value) || null)}
                />
              </div>
              <div className="pe-form-group">
                <label>Investment Date</label>
                <input
                  type="date"
                  value={formData.investmentDate || ''}
                  onChange={e => handleInputChange('investmentDate', e.target.value || null)}
                />
              </div>
              <div className="pe-form-group">
                <label>Last Valuation Date</label>
                <input
                  type="date"
                  value={formData.lastValuationDate || ''}
                  onChange={e => handleInputChange('lastValuationDate', e.target.value || null)}
                />
              </div>
              <div className="pe-form-group">
                <label>Valuation Source</label>
                <input
                  type="text"
                  value={formData.valuationSource || ''}
                  onChange={e => handleInputChange('valuationSource', e.target.value || null)}
                  placeholder="e.g., Latest Round"
                />
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
        ) : (
          <div className="pe-details-grid">
            <div className="pe-detail-item">
              <span className="pe-detail-label">Price per Share</span>
              <span className="pe-detail-value">
                {investment?.pricePerShare != null ? `₹${investment.pricePerShare.toLocaleString()}` : '-'}
              </span>
            </div>
            <div className="pe-detail-item">
              <span className="pe-detail-label">Quantity Held</span>
              <span className="pe-detail-value">
                {investment?.quantityHeld != null ? investment.quantityHeld.toLocaleString() : '-'}
              </span>
            </div>
            <div className="pe-detail-item">
              <span className="pe-detail-label">Ownership</span>
              <span className="pe-detail-value">{formatOwnership(investment?.ownershipPercentage || null)}</span>
            </div>
            <div className="pe-detail-item">
              <span className="pe-detail-label">Investment Date</span>
              <span className="pe-detail-value">
                {investment?.investmentDate
                  ? new Date(investment.investmentDate).toLocaleDateString()
                  : '-'}
              </span>
            </div>
            <div className="pe-detail-item">
              <span className="pe-detail-label">Last Valuation</span>
              <span className="pe-detail-value">
                {investment?.lastValuationDate
                  ? new Date(investment.lastValuationDate).toLocaleDateString()
                  : '-'}
              </span>
            </div>
            <div className="pe-detail-item">
              <span className="pe-detail-label">Valuation Source</span>
              <span className="pe-detail-value">{investment?.valuationSource || '-'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
