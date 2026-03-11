'use client';

import React, { useState } from 'react';
import {
  Thesis,
  ThesisHistoryEntry,
  ThesisStatus,
  CreateThesisRequest,
  UpdateThesisRequest,
} from '../../../types/thesis';
import { ThesisStatusBadge } from './ThesisStatusBadge';
import { KPIList } from './KPIList';
import { BreakConditionsList } from './BreakConditionsList';
import { SignalsSection } from './SignalsSection';
import { LatestNote } from './LatestNote';
import { ThesisHistoryTimeline } from './ThesisHistoryTimeline';
import './thesis.css';

interface ThesisTrackerCardProps {
  thesis: Thesis | null;
  recentHistory: ThesisHistoryEntry[];
  stockCode: string;
  stockName: string;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onCreateThesis: (data: Omit<CreateThesisRequest, 'stockCode' | 'stockName'>) => Promise<void>;
  onUpdateThesis: (data: UpdateThesisRequest) => Promise<void>;
  onClearError: () => void;
}

export function ThesisTrackerCard({
  thesis,
  recentHistory,
  stockCode,
  stockName,
  isLoading,
  isSaving,
  error,
  onCreateThesis,
  onUpdateThesis,
  onClearError,
}: ThesisTrackerCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedThesis, setEditedThesis] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Loading state
  if (isLoading) {
    return (
      <div className="thesis-card">
        <div className="thesis-loading">
          <div className="thesis-loading-spinner" />
          <p>Loading thesis data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="thesis-card">
        <div className="thesis-error">
          <div className="thesis-error-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <p>{error}</p>
          <button onClick={onClearError} className="thesis-error-dismiss">
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Empty state - no thesis yet
  if (!thesis) {
    return (
      <div className="thesis-card">
        <div className="thesis-empty">
          <div className="thesis-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3>No Investment Thesis</h3>
          <p>Create an investment thesis to track your investment rationale for {stockName}.</p>
          <button
            className="thesis-create-btn"
            onClick={() => onCreateThesis({ status: 'intact' })}
            disabled={isSaving}
          >
            {isSaving ? 'Creating...' : 'Create Thesis'}
          </button>
        </div>
      </div>
    );
  }

  const handleStatusChange = async (newStatus: ThesisStatus) => {
    await onUpdateThesis({
      status: newStatus,
      changeNote: `Status changed to ${newStatus}`,
    });
  };

  const handleThesisSave = async () => {
    await onUpdateThesis({
      originalThesis: editedThesis,
      changeNote: 'Updated investment thesis',
    });
    setIsEditing(false);
  };

  const handleNoteSave = async (note: string) => {
    await onUpdateThesis({
      latestNote: note,
      changeNote: 'Added new note',
    });
  };

  const handleMarkReviewed = async () => {
    await onUpdateThesis({
      lastReviewDate: new Date().toISOString(),
      changeNote: 'Marked as reviewed',
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="thesis-card">
      {/* Header with status */}
      <div className="thesis-header">
        <ThesisStatusBadge
          status={thesis.status}
          onStatusChange={handleStatusChange}
          disabled={isSaving}
        />
        <button
          className="thesis-review-btn"
          onClick={handleMarkReviewed}
          disabled={isSaving}
          title="Mark as reviewed today"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Review
        </button>
      </div>

      {/* Meta info */}
      <div className="thesis-meta">
        <div className="thesis-meta-item">
          <span className="thesis-meta-label">Last Review</span>
          <span className="thesis-meta-value">{formatDate(thesis.lastReviewDate)}</span>
        </div>
        <div className="thesis-meta-item">
          <span className="thesis-meta-label">Created</span>
          <span className="thesis-meta-value">{formatDate(thesis.createdAt)}</span>
        </div>
        <div className="thesis-meta-item">
          <span className="thesis-meta-label">Version</span>
          <span className="thesis-meta-value">v{thesis.version}</span>
        </div>
      </div>

      {/* Original Thesis */}
      <div className="thesis-section">
        <div className="thesis-section-header">
          <span>Investment Thesis</span>
          {!isEditing && (
            <button
              className="thesis-edit-btn"
              onClick={() => {
                setEditedThesis(thesis.originalThesis || '');
                setIsEditing(true);
              }}
              disabled={isSaving}
            >
              Edit
            </button>
          )}
        </div>
        {isEditing ? (
          <div className="thesis-edit-form">
            <textarea
              value={editedThesis}
              onChange={(e) => setEditedThesis(e.target.value)}
              placeholder="Write your investment thesis..."
              rows={6}
              className="thesis-textarea"
            />
            <div className="thesis-edit-actions">
              <button
                className="thesis-cancel-btn"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                className="thesis-save-btn"
                onClick={handleThesisSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="thesis-content">
            {thesis.originalThesis ? (
              <p className="thesis-content-text">{thesis.originalThesis}</p>
            ) : (
              <p className="thesis-content-empty">No thesis written yet. Click edit to add one.</p>
            )}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="thesis-section">
        <div className="thesis-section-header">
          <span>Key KPIs to Watch</span>
        </div>
        <KPIList
          kpis={thesis.kpis}
          onUpdate={(kpis) => onUpdateThesis({ kpis, changeNote: 'Updated KPIs' })}
          disabled={isSaving}
        />
      </div>

      {/* Break Conditions */}
      <div className="thesis-section">
        <div className="thesis-section-header">
          <span>Thesis Break Conditions</span>
        </div>
        <BreakConditionsList
          conditions={thesis.breakConditions}
          onUpdate={(breakConditions) =>
            onUpdateThesis({ breakConditions, changeNote: 'Updated break conditions' })
          }
          disabled={isSaving}
        />
      </div>

      {/* Signals */}
      <div className="thesis-section">
        <div className="thesis-section-header">
          <span>Current Signals</span>
        </div>
        <SignalsSection
          signals={thesis.signals}
          onUpdate={(signals) => onUpdateThesis({ signals, changeNote: 'Updated signals' })}
          disabled={isSaving}
        />
      </div>

      {/* Latest Note */}
      <div className="thesis-section">
        <div className="thesis-section-header">
          <span>Latest Note</span>
        </div>
        <LatestNote
          note={thesis.latestNote}
          onSave={handleNoteSave}
          disabled={isSaving}
        />
      </div>

      {/* History */}
      <div className="thesis-section">
        <button
          className="thesis-history-toggle"
          onClick={() => setShowHistory(!showHistory)}
        >
          <span>Action History</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={showHistory ? 'rotated' : ''}
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showHistory && (
          <ThesisHistoryTimeline
            history={recentHistory}
            stockCode={stockCode}
          />
        )}
      </div>
    </div>
  );
}
