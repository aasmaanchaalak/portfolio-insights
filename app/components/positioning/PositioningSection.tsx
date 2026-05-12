'use client';

import React, { useState, useEffect, useRef } from 'react';
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

  // Themes state
  const [stockThemes, setStockThemes] = useState<string[]>([]);
  const [allThemeNames, setAllThemeNames] = useState<string[]>([]);
  const [themeInput, setThemeInput] = useState('');
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const themeInputRef = useRef<HTMLInputElement>(null);
  const themeDropdownRef = useRef<HTMLDivElement>(null);

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

  // Fetch themes data
  useEffect(() => {
    if (!stockCode) return;

    const fetchThemes = async () => {
      try {
        const response = await fetch('/api/themes');
        if (response.ok) {
          const data = await response.json();
          setStockThemes(data.themes[stockCode] || []);
          setAllThemeNames(data.allNames || []);
        }
      } catch (error) {
        console.error('Error fetching themes:', error);
      }
    };

    fetchThemes();
  }, [stockCode]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node) &&
        themeInputRef.current && !themeInputRef.current.contains(e.target as Node)
      ) {
        setShowThemeDropdown(false);
        setThemeInput('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const saveThemes = async (themes: string[]) => {
    if (!stockCode) return;
    try {
      await fetch('/api/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: stockCode, themes }),
      });
      // Update allThemeNames to include any newly created theme
      setAllThemeNames(prev => {
        const combined = Array.from(new Set([...prev, ...themes])).sort();
        return combined;
      });
    } catch (error) {
      console.error('Error saving themes:', error);
    }
  };

  const toggleTheme = (theme: string) => {
    const trimmed = theme.trim();
    if (!trimmed) return;
    const updated = stockThemes.includes(trimmed)
      ? stockThemes.filter(t => t !== trimmed)
      : [...stockThemes, trimmed];
    setStockThemes(updated);
    saveThemes(updated);
  };

  const handleThemeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = themeInput.trim();
      if (trimmed) {
        toggleTheme(trimmed);
        setThemeInput('');
        setShowThemeDropdown(false);
      }
    } else if (e.key === 'Escape') {
      setShowThemeDropdown(false);
      setThemeInput('');
    }
  };

  const filteredThemeOptions = allThemeNames.filter(name =>
    name.toLowerCase().includes(themeInput.toLowerCase())
  );
  const inputIsNew = themeInput.trim() !== '' && !allThemeNames.some(
    n => n.toLowerCase() === themeInput.trim().toLowerCase()
  );

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

      {/* Themes section — always visible */}
      <div className="themes-section">
        <div className="themes-section-header">
          <span className="themes-section-title">Themes</span>
        </div>

        {stockThemes.length > 0 && (
          <div className="themes-chips">
            {stockThemes.map(theme => (
              <span key={theme} className="theme-chip">
                {theme}
                <button
                  className="theme-chip-remove"
                  onClick={() => toggleTheme(theme)}
                  title={`Remove ${theme}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="theme-input-wrapper">
          <input
            ref={themeInputRef}
            type="text"
            className="theme-tag-input"
            placeholder="Add theme..."
            value={themeInput}
            onChange={e => { setThemeInput(e.target.value); setShowThemeDropdown(true); }}
            onFocus={() => setShowThemeDropdown(true)}
            onKeyDown={handleThemeInputKeyDown}
          />
          {showThemeDropdown && (filteredThemeOptions.length > 0 || inputIsNew) && (
            <div className="theme-dropdown" ref={themeDropdownRef}>
              {filteredThemeOptions.map(name => (
                <div
                  key={name}
                  className={`theme-dropdown-item ${stockThemes.includes(name) ? 'selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); toggleTheme(name); setThemeInput(''); setShowThemeDropdown(false); }}
                >
                  <span style={{ fontSize: '0.7rem' }}>{stockThemes.includes(name) ? '☑' : '☐'}</span>
                  {name}
                </div>
              ))}
              {inputIsNew && (
                <div
                  className="theme-dropdown-item create-new"
                  onMouseDown={e => { e.preventDefault(); toggleTheme(themeInput.trim()); setThemeInput(''); setShowThemeDropdown(false); }}
                >
                  + Add "{themeInput.trim()}"
                </div>
              )}
            </div>
          )}
          {showThemeDropdown && filteredThemeOptions.length === 0 && !inputIsNew && themeInput.trim() === '' && allThemeNames.length === 0 && (
            <div className="theme-dropdown" ref={themeDropdownRef}>
              <div className="theme-dropdown-empty">Type to create a new theme</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
