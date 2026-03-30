'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PEThesis,
  PEThesisBreakCondition,
  PEThesisHistory,
  ThesisStatus,
  UpdatePEThesisRequest,
} from '../../../../types/pe';

interface ThesisTabProps {
  companyId: string;
  thesis: PEThesis | null;
  onThesisUpdated: (thesis: PEThesis) => void;
}

const STATUS_OPTIONS: { value: ThesisStatus; label: string; color: string }[] = [
  { value: 'intact', label: 'Intact', color: 'var(--positive-color)' },
  { value: 'monitor', label: 'Monitor', color: 'var(--warning-color)' },
  { value: 'broken', label: 'Broken', color: 'var(--negative-color)' },
];

export function ThesisTab({ companyId, thesis, onThesisUpdated }: ThesisTabProps) {
  const [breakConditions, setBreakConditions] = useState<PEThesisBreakCondition[]>([]);
  const [history, setHistory] = useState<PEThesisHistory[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [formData, setFormData] = useState<UpdatePEThesisRequest>({
    status: thesis?.status || 'intact',
    originalThesis: thesis?.originalThesis || '',
    keyDrivers: thesis?.keyDrivers || '',
    latestNote: thesis?.latestNote || '',
  });
  const [editConditions, setEditConditions] = useState<{
    id?: string;
    condition: string;
    isTriggered: boolean;
    sortOrder: number;
  }[]>([]);

  const fetchThesisData = useCallback(async () => {
    try {
      const response = await fetch(`/api/pe/${companyId}/thesis`);
      if (response.ok) {
        const data = await response.json();
        setBreakConditions(data.breakConditions || []);
      }
    } catch (err) {
      console.error('Error fetching thesis data:', err);
    }
  }, [companyId]);

  const fetchHistory = useCallback(async () => {
    if (!thesis) return;
    try {
      const response = await fetch(`/api/pe/${companyId}/thesis-history?limit=20`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Error fetching thesis history:', err);
    }
  }, [companyId, thesis]);

  useEffect(() => {
    fetchThesisData();
  }, [fetchThesisData]);

  useEffect(() => {
    if (showHistory) {
      fetchHistory();
    }
  }, [showHistory, fetchHistory]);

  const handleEdit = () => {
    setFormData({
      status: thesis?.status || 'intact',
      originalThesis: thesis?.originalThesis || '',
      keyDrivers: thesis?.keyDrivers || '',
      latestNote: thesis?.latestNote || '',
    });
    setEditConditions(
      breakConditions.map(c => ({
        id: c.id,
        condition: c.condition,
        isTriggered: c.isTriggered,
        sortOrder: c.sortOrder,
      }))
    );
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/pe/${companyId}/thesis`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          breakConditions: editConditions,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');

      const data = await response.json();
      onThesisUpdated(data.thesis);
      setBreakConditions(data.breakConditions || []);
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving thesis:', err);
      alert('Failed to save thesis');
    } finally {
      setIsSaving(false);
    }
  };

  const addCondition = () => {
    setEditConditions(prev => [
      ...prev,
      { condition: '', isTriggered: false, sortOrder: prev.length },
    ]);
  };

  const removeCondition = (index: number) => {
    setEditConditions(prev => prev.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: string, value: any) => {
    setEditConditions(prev =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const getStatusClass = (status: ThesisStatus | undefined) => {
    switch (status) {
      case 'intact':
        return 'pe-thesis-status-intact';
      case 'monitor':
        return 'pe-thesis-status-monitor';
      case 'broken':
        return 'pe-thesis-status-broken';
      default:
        return '';
    }
  };

  const formatHistoryAction = (entry: PEThesisHistory) => {
    switch (entry.actionType) {
      case 'created':
        return 'Thesis created';
      case 'updated':
        return `Updated ${entry.fieldChanged?.replace(/_/g, ' ')}`;
      case 'break_condition_added':
        return `Added break condition: "${entry.newValue}"`;
      case 'break_condition_removed':
        return `Removed break condition: "${entry.oldValue}"`;
      case 'break_condition_triggered':
        return `${entry.newValue === 'true' ? 'Triggered' : 'Untriggered'} break condition: "${entry.note}"`;
      default:
        return entry.actionType;
    }
  };

  if (!thesis && !isEditing) {
    return (
      <div className="pe-thesis-empty">
        <div className="pe-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3>No Thesis Recorded</h3>
        <p>Create an investment thesis to track your conviction and key drivers.</p>
        <button className="pe-btn-primary" onClick={handleEdit} type="button">
          Create Thesis
        </button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="pe-thesis-edit">
        <div className="pe-form-group">
          <label>Status</label>
          <div className="pe-status-selector">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`pe-status-option ${formData.status === opt.value ? 'selected' : ''}`}
                style={{ '--status-color': opt.color } as React.CSSProperties}
                onClick={() => setFormData(prev => ({ ...prev, status: opt.value }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pe-form-group">
          <label>Original Thesis</label>
          <textarea
            value={formData.originalThesis || ''}
            onChange={e => setFormData(prev => ({ ...prev, originalThesis: e.target.value }))}
            placeholder="What is your investment thesis?"
            rows={4}
          />
        </div>

        <div className="pe-form-group">
          <label>Key Drivers</label>
          <textarea
            value={formData.keyDrivers || ''}
            onChange={e => setFormData(prev => ({ ...prev, keyDrivers: e.target.value }))}
            placeholder="What are the key value drivers? (one per line)"
            rows={3}
          />
        </div>

        <div className="pe-form-group">
          <label>Latest Note</label>
          <textarea
            value={formData.latestNote || ''}
            onChange={e => setFormData(prev => ({ ...prev, latestNote: e.target.value }))}
            placeholder="Any recent observations or updates?"
            rows={2}
          />
        </div>

        <div className="pe-break-conditions-section">
          <div className="pe-section-header">
            <label>Break Conditions</label>
            <button type="button" className="pe-add-condition-btn" onClick={addCondition}>
              + Add Condition
            </button>
          </div>
          {editConditions.length === 0 ? (
            <p className="pe-muted">No break conditions defined</p>
          ) : (
            <div className="pe-conditions-list">
              {editConditions.map((condition, index) => (
                <div key={index} className="pe-condition-edit">
                  <input
                    type="checkbox"
                    checked={condition.isTriggered}
                    onChange={e => updateCondition(index, 'isTriggered', e.target.checked)}
                  />
                  <input
                    type="text"
                    value={condition.condition}
                    onChange={e => updateCondition(index, 'condition', e.target.value)}
                    placeholder="Define break condition..."
                  />
                  <button
                    type="button"
                    className="pe-remove-condition-btn"
                    onClick={() => removeCondition(index)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
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
            {isSaving ? 'Saving...' : 'Save Thesis'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pe-thesis-view">
      {/* Status Badge */}
      <div className="pe-thesis-header">
        <span className={`pe-thesis-status ${getStatusClass(thesis?.status)}`}>
          {thesis?.status?.toUpperCase() || 'NOT SET'}
        </span>
        <button className="pe-edit-btn" onClick={handleEdit} type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit
        </button>
      </div>

      {/* Original Thesis */}
      <div className="pe-thesis-section">
        <h4>Investment Thesis</h4>
        <p className="pe-thesis-text">{thesis?.originalThesis || 'No thesis recorded'}</p>
      </div>

      {/* Key Drivers */}
      {thesis?.keyDrivers && (
        <div className="pe-thesis-section">
          <h4>Key Drivers</h4>
          <div className="pe-drivers-list">
            {thesis.keyDrivers.split('\n').filter(d => d.trim()).map((driver, i) => (
              <div key={i} className="pe-driver-item">
                <span className="pe-driver-bullet">•</span>
                {driver.trim()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Break Conditions */}
      {breakConditions.length > 0 && (
        <div className="pe-thesis-section">
          <h4>Break Conditions</h4>
          <div className="pe-conditions-view">
            {breakConditions.map(condition => (
              <div
                key={condition.id}
                className={`pe-condition-item ${condition.isTriggered ? 'triggered' : ''}`}
              >
                <span className="pe-condition-check">
                  {condition.isTriggered ? '⚠️' : '○'}
                </span>
                <span className="pe-condition-text">{condition.condition}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Latest Note */}
      {thesis?.latestNote && (
        <div className="pe-thesis-section">
          <h4>Latest Note</h4>
          <p className="pe-thesis-note">{thesis.latestNote}</p>
        </div>
      )}

      {/* Last Review */}
      {thesis?.lastReviewDate && (
        <p className="pe-last-review">
          Last reviewed: {new Date(thesis.lastReviewDate).toLocaleDateString()}
        </p>
      )}

      {/* History Toggle */}
      <div className="pe-history-section">
        <button
          type="button"
          className="pe-history-toggle"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? '▼' : '▶'} Thesis History
        </button>
        {showHistory && (
          <div className="pe-history-list">
            {history.length === 0 ? (
              <p className="pe-muted">No history available</p>
            ) : (
              history.map(entry => (
                <div key={entry.id} className="pe-history-item">
                  <span className="pe-history-date">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                  <span className="pe-history-action">{formatHistoryAction(entry)}</span>
                  {entry.userEmail && (
                    <span className="pe-history-user">by {entry.userEmail}</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
