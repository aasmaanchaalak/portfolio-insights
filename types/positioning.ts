// Positioning System Types

export type Conviction = 'high' | 'medium' | 'low';
export type StrategyType = 'core_compounder' | 'cyclical' | 'optionality' | 'special_situation' | 'trading';
export type ActionIntent = 'add' | 'hold' | 'trim' | 'exit';
export type TimeHorizon = 'long_term' | 'medium_term' | 'short_term';

export interface StockPositioning {
  conviction: Conviction;
  strategyType: StrategyType;
  actionIntent: ActionIntent;
  timeHorizon?: TimeHorizon;
}

// Display labels for UI
export const CONVICTION_LABELS: Record<Conviction, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const STRATEGY_LABELS: Record<StrategyType, string> = {
  core_compounder: 'Core',
  cyclical: 'Cyclical',
  optionality: 'Optionality',
  special_situation: 'Special',
  trading: 'Trading',
};

export const ACTION_LABELS: Record<ActionIntent, string> = {
  add: 'Add',
  hold: 'Hold',
  trim: 'Trim',
  exit: 'Exit',
};

export const TIME_HORIZON_LABELS: Record<TimeHorizon, string> = {
  long_term: 'Long Term',
  medium_term: 'Medium Term',
  short_term: 'Short Term',
};

// Full display names for dropdowns
export const STRATEGY_FULL_LABELS: Record<StrategyType, string> = {
  core_compounder: 'Core Compounder',
  cyclical: 'Cyclical',
  optionality: 'Optionality',
  special_situation: 'Special Situation',
  trading: 'Trading',
};

// Default positioning for new stocks
export const DEFAULT_POSITIONING: StockPositioning = {
  conviction: 'medium',
  strategyType: 'core_compounder',
  actionIntent: 'hold',
};

// All values for each dimension (for filters and dropdowns)
export const ALL_CONVICTIONS: Conviction[] = ['high', 'medium', 'low'];
export const ALL_STRATEGIES: StrategyType[] = ['core_compounder', 'cyclical', 'optionality', 'special_situation', 'trading'];
export const ALL_ACTIONS: ActionIntent[] = ['add', 'hold', 'trim', 'exit'];
export const ALL_TIME_HORIZONS: TimeHorizon[] = ['long_term', 'medium_term', 'short_term'];
