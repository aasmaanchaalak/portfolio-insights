'use client';

import React, { useState } from 'react';
import { ThesisKPI, KPIStatus } from '../../../types/thesis';

interface KPIListProps {
  kpis: ThesisKPI[];
  onUpdate: (kpis: ThesisKPI[]) => void;
  disabled?: boolean;
}

const STATUS_OPTIONS: { value: KPIStatus; label: string }[] = [
  { value: 'on_track', label: 'On Track' },
  { value: 'warning', label: 'Warning' },
  { value: 'breached', label: 'Breached' },
];

export function KPIList({ kpis, onUpdate, disabled }: KPIListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newKPI, setNewKPI] = useState({ description: '', targetValue: '' });

  const handleAddKPI = () => {
    if (!newKPI.description.trim()) return;

    const kpi: ThesisKPI = {
      id: crypto.randomUUID(),
      description: newKPI.description.trim(),
      targetValue: newKPI.targetValue.trim() || null,
      currentStatus: 'on_track',
      sortOrder: kpis.length,
    };

    onUpdate([...kpis, kpi]);
    setNewKPI({ description: '', targetValue: '' });
    setIsAdding(false);
  };

  const handleRemoveKPI = (id: string) => {
    onUpdate(kpis.filter((kpi) => kpi.id !== id));
  };

  const handleStatusChange = (id: string, status: KPIStatus) => {
    onUpdate(
      kpis.map((kpi) =>
        kpi.id === id ? { ...kpi, currentStatus: status } : kpi
      )
    );
  };

  if (kpis.length === 0 && !isAdding) {
    return (
      <div className="kpi-empty">
        <p>No KPIs defined yet.</p>
        <button
          className="kpi-add-btn"
          onClick={() => setIsAdding(true)}
          disabled={disabled}
        >
          + Add KPI
        </button>
      </div>
    );
  }

  return (
    <div className="kpi-list">
      {kpis.map((kpi) => (
        <div key={kpi.id} className={`kpi-item ${kpi.currentStatus}`}>
          <div className={`kpi-status-dot ${kpi.currentStatus}`} />
          <div className="kpi-content">
            <p className="kpi-description">{kpi.description}</p>
            {kpi.targetValue && (
              <p className="kpi-target">Target: {kpi.targetValue}</p>
            )}
          </div>
          <div className="kpi-actions">
            <select
              value={kpi.currentStatus}
              onChange={(e) => handleStatusChange(kpi.id, e.target.value as KPIStatus)}
              disabled={disabled}
              className="kpi-status-select"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="kpi-remove-btn"
              onClick={() => handleRemoveKPI(kpi.id)}
              disabled={disabled}
              aria-label="Remove KPI"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}

      {isAdding ? (
        <div className="kpi-add-form">
          <input
            type="text"
            placeholder="KPI description..."
            value={newKPI.description}
            onChange={(e) => setNewKPI({ ...newKPI, description: e.target.value })}
            className="kpi-input"
            autoFocus
          />
          <input
            type="text"
            placeholder="Target (optional)"
            value={newKPI.targetValue}
            onChange={(e) => setNewKPI({ ...newKPI, targetValue: e.target.value })}
            className="kpi-input kpi-input-target"
          />
          <div className="kpi-add-actions">
            <button
              className="kpi-cancel-btn"
              onClick={() => {
                setIsAdding(false);
                setNewKPI({ description: '', targetValue: '' });
              }}
            >
              Cancel
            </button>
            <button
              className="kpi-save-btn"
              onClick={handleAddKPI}
              disabled={!newKPI.description.trim()}
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          className="kpi-add-btn"
          onClick={() => setIsAdding(true)}
          disabled={disabled}
        >
          + Add KPI
        </button>
      )}
    </div>
  );
}
