'use client';

import React, { useState, useEffect } from 'react';
import {
  StockPositioning,
  Conviction,
  StrategyType,
  ActionIntent,
  TimeHorizon,
  CONVICTION_LABELS,
  STRATEGY_FULL_LABELS,
  ACTION_LABELS,
  TIME_HORIZON_LABELS,
  ALL_CONVICTIONS,
  ALL_STRATEGIES,
  ALL_ACTIONS,
  ALL_TIME_HORIZONS,
  DEFAULT_POSITIONING,
} from '../../../types/positioning';
import { PositioningChip } from './PositioningChip';
import './positioning.css';

interface PositioningSectionProps {
  stockCode: string | null;
  onPositioningChange?: (positioning: StockPositioning) => void;
}

export function PositioningSection({ stockCode, onPositioningChange }: PositioningSectionProps) {
  const [positioning, setPositioning] = useState<StockPositioning | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<StockPositioning>(DEFAULT_POSITIONING);

  // Fetch positioning data
  useEffect(() => {
    if (!stockCode) return;

    const fetchPositioning = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/positioning');
        if (response.ok) {
          const data = await response.json();
          if (data[stockCode]) {
            setPositioning(data[stockCode]);
            setFormData(data[stockCode]);
          } else {
            setPositioning(null);
          }
        }
      } catch (error) {
        console.error('Error fetching positioning:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPositioning();
  }, [stockCode]);

  const handleSave = async () => {
    if (!stockCode) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/positioning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: stockCode,
          ...formData,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setPositioning(result.positioning);
        setIsEditing(false);
        onPositioningChange?.(result.positioning);
      }
    } catch (error) {
      console.error('Error saving positioning:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (positioning) {
      setFormData(positioning);
    } else {
      setFormData(DEFAULT_POSITIONING);
    }
    setIsEditing(false);
  };

  const handleStartEditing = () => {
    if (!positioning) {
      setFormData(DEFAULT_POSITIONING);
    }
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="positioning-section">
        <div className="positioning-section-header">
          <span className="positioning-section-title">Positioning</span>
        </div>
        <div className="positioning-empty-state">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="positioning-section">
      <div className="positioning-section-header">
        <span className="positioning-section-title">Positioning</span>
        {!isEditing && (
          <button className="positioning-edit-btn" onClick={handleStartEditing}>
            {positioning ? 'Edit' : 'Set Positioning'}
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="positioning-form">
          <div className="positioning-form-row">
            <label className="positioning-form-label">Conviction</label>
            <select
              className="positioning-form-select"
              value={formData.conviction}
              onChange={(e) => setFormData({ ...formData, conviction: e.target.value as Conviction })}
            >
              {ALL_CONVICTIONS.map(value => (
                <option key={value} value={value}>{CONVICTION_LABELS[value]}</option>
              ))}
            </select>
          </div>

          <div className="positioning-form-row">
            <label className="positioning-form-label">Strategy Type</label>
            <select
              className="positioning-form-select"
              value={formData.strategyType}
              onChange={(e) => setFormData({ ...formData, strategyType: e.target.value as StrategyType })}
            >
              {ALL_STRATEGIES.map(value => (
                <option key={value} value={value}>{STRATEGY_FULL_LABELS[value]}</option>
              ))}
            </select>
          </div>

          <div className="positioning-form-row">
            <label className="positioning-form-label">Action Intent</label>
            <select
              className="positioning-form-select"
              value={formData.actionIntent}
              onChange={(e) => setFormData({ ...formData, actionIntent: e.target.value as ActionIntent })}
            >
              {ALL_ACTIONS.map(value => (
                <option key={value} value={value}>{ACTION_LABELS[value]}</option>
              ))}
            </select>
          </div>

          <div className="positioning-form-row">
            <label className="positioning-form-label">Time Horizon (optional)</label>
            <select
              className="positioning-form-select"
              value={formData.timeHorizon || ''}
              onChange={(e) => setFormData({
                ...formData,
                timeHorizon: e.target.value ? e.target.value as TimeHorizon : undefined
              })}
            >
              <option value="">Not specified</option>
              {ALL_TIME_HORIZONS.map(value => (
                <option key={value} value={value}>{TIME_HORIZON_LABELS[value]}</option>
              ))}
            </select>
          </div>

          <div className="positioning-form-actions">
            <button className="positioning-cancel-btn" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </button>
            <button className="positioning-save-btn" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : positioning ? (
        <div className="positioning-display">
          <div className="positioning-display-item">
            <span className="positioning-display-label">Conviction</span>
            <PositioningChip type="conviction" value={positioning.conviction} size="medium" />
          </div>
          <div className="positioning-display-item">
            <span className="positioning-display-label">Strategy</span>
            <PositioningChip type="strategy" value={positioning.strategyType} size="medium" />
          </div>
          <div className="positioning-display-item">
            <span className="positioning-display-label">Action</span>
            <PositioningChip type="action" value={positioning.actionIntent} size="medium" />
          </div>
          {positioning.timeHorizon && (
            <div className="positioning-display-item">
              <span className="positioning-display-label">Time Horizon</span>
              <span className="positioning-chip chip-size-medium" style={{ backgroundColor: '#f3f4f6', color: '#374151' }}>
                {TIME_HORIZON_LABELS[positioning.timeHorizon]}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="positioning-empty-state">
          <p>No positioning set for this stock.</p>
          <button className="positioning-set-btn" onClick={handleStartEditing}>
            Set Positioning
          </button>
        </div>
      )}
    </div>
  );
}
