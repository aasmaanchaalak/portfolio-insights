'use client';

import React from 'react';
import {
  Conviction,
  StrategyType,
  ActionIntent,
  CONVICTION_LABELS,
  STRATEGY_LABELS,
  ACTION_LABELS,
  ALL_CONVICTIONS,
  ALL_STRATEGIES,
  ALL_ACTIONS,
} from '../../../types/positioning';
import './positioning.css';

export interface PositioningFilterState {
  convictions: Conviction[];
  strategies: StrategyType[];
  actions: ActionIntent[];
}

interface PositioningFiltersProps {
  filters: PositioningFilterState;
  onChange: (filters: PositioningFilterState) => void;
}

export function PositioningFilters({ filters, onChange }: PositioningFiltersProps) {
  const toggleConviction = (value: Conviction) => {
    const newConvictions = filters.convictions.includes(value)
      ? filters.convictions.filter(c => c !== value)
      : [...filters.convictions, value];
    onChange({ ...filters, convictions: newConvictions });
  };

  const toggleStrategy = (value: StrategyType) => {
    const newStrategies = filters.strategies.includes(value)
      ? filters.strategies.filter(s => s !== value)
      : [...filters.strategies, value];
    onChange({ ...filters, strategies: newStrategies });
  };

  const toggleAction = (value: ActionIntent) => {
    const newActions = filters.actions.includes(value)
      ? filters.actions.filter(a => a !== value)
      : [...filters.actions, value];
    onChange({ ...filters, actions: newActions });
  };

  const clearAll = () => {
    onChange({ convictions: [], strategies: [], actions: [] });
  };

  const hasActiveFilters = filters.convictions.length > 0 || filters.strategies.length > 0 || filters.actions.length > 0;

  return (
    <div className="positioning-filters">
      <div className="filter-group-horizontal">
        <span className="filter-group-label">Conviction</span>
        <div className="filter-chips">
          {ALL_CONVICTIONS.map(value => (
            <button
              key={value}
              className={`filter-chip conviction-${value} ${filters.convictions.includes(value) ? 'selected' : ''}`}
              onClick={() => toggleConviction(value)}
            >
              {CONVICTION_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group-horizontal">
        <span className="filter-group-label">Strategy</span>
        <div className="filter-chips">
          {ALL_STRATEGIES.map(value => (
            <button
              key={value}
              className={`filter-chip strategy-${value} ${filters.strategies.includes(value) ? 'selected' : ''}`}
              onClick={() => toggleStrategy(value)}
            >
              {STRATEGY_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group-horizontal">
        <span className="filter-group-label">Action</span>
        <div className="filter-chips">
          {ALL_ACTIONS.map(value => (
            <button
              key={value}
              className={`filter-chip action-${value} ${filters.actions.includes(value) ? 'selected' : ''}`}
              onClick={() => toggleAction(value)}
            >
              {ACTION_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {hasActiveFilters && (
        <button className="clear-filters-btn" onClick={clearAll}>
          Clear All
        </button>
      )}
    </div>
  );
}

export const INITIAL_POSITIONING_FILTERS: PositioningFilterState = {
  convictions: [],
  strategies: [],
  actions: [],
};
