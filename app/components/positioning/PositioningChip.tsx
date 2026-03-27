'use client';

import React from 'react';
import {
  Conviction,
  StrategyType,
  ActionIntent,
  CONVICTION_LABELS,
  STRATEGY_LABELS,
  ACTION_LABELS,
} from '../../../types/positioning';
import './positioning.css';

interface PositioningChipProps {
  type: 'conviction' | 'strategy' | 'action';
  value: Conviction | StrategyType | ActionIntent;
  size?: 'small' | 'medium';
}

export function PositioningChip({ type, value, size = 'small' }: PositioningChipProps) {
  const getLabel = () => {
    switch (type) {
      case 'conviction':
        return CONVICTION_LABELS[value as Conviction];
      case 'strategy':
        return STRATEGY_LABELS[value as StrategyType];
      case 'action':
        return ACTION_LABELS[value as ActionIntent];
      default:
        return value;
    }
  };

  return (
    <span className={`positioning-chip chip-${type}-${value} chip-size-${size}`}>
      {getLabel()}
    </span>
  );
}

interface PositioningChipsProps {
  conviction?: Conviction | null;
  strategyType?: StrategyType | null;
  actionIntent?: ActionIntent | null;
  size?: 'small' | 'medium';
}

export function PositioningChips({ conviction, strategyType, actionIntent, size = 'small' }: PositioningChipsProps) {
  const hasAny = conviction || strategyType || actionIntent;

  if (!hasAny) {
    return <span className="positioning-empty">-</span>;
  }

  return (
    <div className="positioning-chips">
      {conviction && (
        <PositioningChip type="conviction" value={conviction} size={size} />
      )}
      {strategyType && (
        <PositioningChip type="strategy" value={strategyType} size={size} />
      )}
      {actionIntent && (
        <PositioningChip type="action" value={actionIntent} size={size} />
      )}
    </div>
  );
}
