'use client';

import React, { useState } from 'react';
import { ThesisBreakCondition } from '../../../types/thesis';

interface BreakConditionsListProps {
  conditions: ThesisBreakCondition[];
  onUpdate: (conditions: ThesisBreakCondition[]) => void;
  disabled?: boolean;
}

export function BreakConditionsList({
  conditions,
  onUpdate,
  disabled,
}: BreakConditionsListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newCondition, setNewCondition] = useState('');

  const handleAddCondition = () => {
    if (!newCondition.trim()) return;

    const condition: ThesisBreakCondition = {
      id: crypto.randomUUID(),
      condition: newCondition.trim(),
      isTriggered: false,
      triggeredAt: null,
      sortOrder: conditions.length,
    };

    onUpdate([...conditions, condition]);
    setNewCondition('');
    setIsAdding(false);
  };

  const handleToggle = (id: string) => {
    onUpdate(
      conditions.map((c) =>
        c.id === id
          ? {
              ...c,
              isTriggered: !c.isTriggered,
              triggeredAt: !c.isTriggered ? new Date().toISOString() : null,
            }
          : c
      )
    );
  };

  const handleRemove = (id: string) => {
    onUpdate(conditions.filter((c) => c.id !== id));
  };

  if (conditions.length === 0 && !isAdding) {
    return (
      <div className="break-condition-empty">
        <p>No break conditions defined.</p>
        <button
          className="break-condition-add-btn"
          onClick={() => setIsAdding(true)}
          disabled={disabled}
        >
          + Add Condition
        </button>
      </div>
    );
  }

  return (
    <div className="break-condition-list">
      {conditions.map((condition) => (
        <div
          key={condition.id}
          className={`break-condition-item ${condition.isTriggered ? 'triggered' : ''}`}
        >
          <input
            type="checkbox"
            checked={condition.isTriggered}
            onChange={() => handleToggle(condition.id)}
            disabled={disabled}
            className="condition-checkbox"
            id={`condition-${condition.id}`}
          />
          <label
            htmlFor={`condition-${condition.id}`}
            className={`condition-text ${condition.isTriggered ? 'triggered' : ''}`}
          >
            {condition.condition}
          </label>
          <button
            className="condition-remove-btn"
            onClick={() => handleRemove(condition.id)}
            disabled={disabled}
            aria-label="Remove condition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      {isAdding ? (
        <div className="break-condition-add-form">
          <input
            type="text"
            placeholder="Enter break condition..."
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
            className="condition-input"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddCondition();
              if (e.key === 'Escape') {
                setIsAdding(false);
                setNewCondition('');
              }
            }}
          />
          <div className="condition-add-actions">
            <button
              className="condition-cancel-btn"
              onClick={() => {
                setIsAdding(false);
                setNewCondition('');
              }}
            >
              Cancel
            </button>
            <button
              className="condition-save-btn"
              onClick={handleAddCondition}
              disabled={!newCondition.trim()}
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          className="break-condition-add-btn"
          onClick={() => setIsAdding(true)}
          disabled={disabled}
        >
          + Add Condition
        </button>
      )}
    </div>
  );
}
