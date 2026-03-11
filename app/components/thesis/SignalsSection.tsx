'use client';

import React, { useState } from 'react';
import { ThesisSignal, SignalType, SignalSentiment } from '../../../types/thesis';

interface SignalsSectionProps {
  signals: ThesisSignal[];
  onUpdate: (signals: ThesisSignal[]) => void;
  disabled?: boolean;
}

const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  fundamental: 'Fundamental',
  technical: 'Technical',
  earnings: 'Earnings',
};

const SENTIMENT_OPTIONS: { value: SignalSentiment; label: string }[] = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
];

interface NewSignal {
  signalType: SignalType;
  title: string;
  description: string;
  sentiment: SignalSentiment;
}

export function SignalsSection({ signals, onUpdate, disabled }: SignalsSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newSignal, setNewSignal] = useState<NewSignal>({
    signalType: 'fundamental',
    title: '',
    description: '',
    sentiment: 'neutral',
  });

  const handleAddSignal = () => {
    if (!newSignal.title.trim()) return;

    const signal: ThesisSignal = {
      id: crypto.randomUUID(),
      signalType: newSignal.signalType,
      title: newSignal.title.trim(),
      description: newSignal.description.trim() || null,
      sentiment: newSignal.sentiment,
      isActive: true,
      expiresAt: null,
    };

    onUpdate([...signals, signal]);
    setNewSignal({
      signalType: 'fundamental',
      title: '',
      description: '',
      sentiment: 'neutral',
    });
    setIsAdding(false);
  };

  const handleRemoveSignal = (id: string) => {
    onUpdate(signals.filter((s) => s.id !== id));
  };

  // Group signals by type
  const groupedSignals = signals.reduce((acc, signal) => {
    if (!acc[signal.signalType]) {
      acc[signal.signalType] = [];
    }
    acc[signal.signalType].push(signal);
    return acc;
  }, {} as Record<SignalType, ThesisSignal[]>);

  if (signals.length === 0 && !isAdding) {
    return (
      <div className="signals-empty">
        <p>No signals tracked.</p>
        <button
          className="signal-add-btn"
          onClick={() => setIsAdding(true)}
          disabled={disabled}
        >
          + Add Signal
        </button>
      </div>
    );
  }

  return (
    <div className="signals-section">
      <div className="signals-grid">
        {(['fundamental', 'technical', 'earnings'] as SignalType[]).map((type) => {
          const typeSignals = groupedSignals[type] || [];
          return (
            <div key={type} className="signals-column">
              <div className="signals-column-header">
                {SIGNAL_TYPE_LABELS[type]}
              </div>
              {typeSignals.length === 0 ? (
                <div className="signals-column-empty">No signals</div>
              ) : (
                typeSignals.map((signal) => (
                  <div key={signal.id} className={`signal-card ${signal.sentiment}`}>
                    <div className="signal-header">
                      <span className={`signal-sentiment ${signal.sentiment}`}>
                        {signal.sentiment === 'positive' ? '+' : signal.sentiment === 'negative' ? '-' : '○'}
                      </span>
                      <button
                        className="signal-remove-btn"
                        onClick={() => handleRemoveSignal(signal.id)}
                        disabled={disabled}
                        aria-label="Remove signal"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <h4 className="signal-title">{signal.title}</h4>
                    {signal.description && (
                      <p className="signal-description">{signal.description}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>

      {isAdding ? (
        <div className="signal-add-form">
          <div className="signal-form-row">
            <select
              value={newSignal.signalType}
              onChange={(e) => setNewSignal({ ...newSignal, signalType: e.target.value as SignalType })}
              className="signal-type-select"
            >
              <option value="fundamental">Fundamental</option>
              <option value="technical">Technical</option>
              <option value="earnings">Earnings</option>
            </select>
            <select
              value={newSignal.sentiment}
              onChange={(e) => setNewSignal({ ...newSignal, sentiment: e.target.value as SignalSentiment })}
              className="signal-sentiment-select"
            >
              {SENTIMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Signal title..."
            value={newSignal.title}
            onChange={(e) => setNewSignal({ ...newSignal, title: e.target.value })}
            className="signal-input"
            autoFocus
          />
          <textarea
            placeholder="Description (optional)..."
            value={newSignal.description}
            onChange={(e) => setNewSignal({ ...newSignal, description: e.target.value })}
            className="signal-textarea"
            rows={2}
          />
          <div className="signal-form-actions">
            <button
              className="signal-cancel-btn"
              onClick={() => {
                setIsAdding(false);
                setNewSignal({
                  signalType: 'fundamental',
                  title: '',
                  description: '',
                  sentiment: 'neutral',
                });
              }}
            >
              Cancel
            </button>
            <button
              className="signal-save-btn"
              onClick={handleAddSignal}
              disabled={!newSignal.title.trim()}
            >
              Add Signal
            </button>
          </div>
        </div>
      ) : (
        <button
          className="signal-add-btn"
          onClick={() => setIsAdding(true)}
          disabled={disabled}
        >
          + Add Signal
        </button>
      )}
    </div>
  );
}
