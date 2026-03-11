// Thesis Status
export type ThesisStatus = 'intact' | 'monitor' | 'broken';

// Signal Types
export type SignalType = 'fundamental' | 'technical' | 'earnings';
export type SignalSentiment = 'positive' | 'negative' | 'neutral';

// KPI Status
export type KPIStatus = 'on_track' | 'warning' | 'breached';

// History Action Types
export type ThesisActionType =
  | 'thesis_created'
  | 'status_changed'
  | 'thesis_updated'
  | 'note_added'
  | 'kpi_added'
  | 'kpi_removed'
  | 'kpi_updated'
  | 'break_condition_added'
  | 'break_condition_removed'
  | 'break_condition_triggered'
  | 'signal_added'
  | 'signal_removed'
  | 'review_completed';

// Main Thesis Interface
export interface Thesis {
  id: string;
  stockCode: string;
  stockName: string;
  status: ThesisStatus;
  originalThesis: string | null;
  latestNote: string | null;
  lastReviewDate: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  kpis: ThesisKPI[];
  breakConditions: ThesisBreakCondition[];
  signals: ThesisSignal[];
}

// KPI Interface
export interface ThesisKPI {
  id: string;
  thesisId?: string;
  description: string;
  targetValue: string | null;
  currentStatus: KPIStatus;
  sortOrder: number;
  createdAt?: string;
}

// Break Condition Interface
export interface ThesisBreakCondition {
  id: string;
  thesisId?: string;
  condition: string;
  isTriggered: boolean;
  triggeredAt: string | null;
  sortOrder: number;
  createdAt?: string;
}

// Signal Interface
export interface ThesisSignal {
  id: string;
  thesisId?: string;
  signalType: SignalType;
  title: string;
  description: string | null;
  sentiment: SignalSentiment;
  isActive: boolean;
  createdAt?: string;
  expiresAt: string | null;
}

// History Entry Interface
export interface ThesisHistoryEntry {
  id: string;
  thesisId: string;
  actionType: ThesisActionType;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  userEmail: string | null;
  createdAt: string;
  changeGroupId: string | null;
}

// API Request Types
export interface CreateThesisRequest {
  stockCode: string;
  stockName: string;
  status?: ThesisStatus;
  originalThesis?: string;
  latestNote?: string;
  kpis?: Omit<ThesisKPI, 'id' | 'thesisId' | 'createdAt'>[];
  breakConditions?: Omit<ThesisBreakCondition, 'id' | 'thesisId' | 'createdAt' | 'triggeredAt'>[];
  signals?: Omit<ThesisSignal, 'id' | 'thesisId' | 'createdAt'>[];
}

export interface UpdateThesisRequest {
  status?: ThesisStatus;
  originalThesis?: string;
  latestNote?: string;
  lastReviewDate?: string;
  kpis?: Omit<ThesisKPI, 'thesisId' | 'createdAt'>[];
  breakConditions?: Omit<ThesisBreakCondition, 'thesisId' | 'createdAt'>[];
  signals?: Omit<ThesisSignal, 'thesisId' | 'createdAt'>[];
  changeNote?: string;
}

// API Response Types
export interface ThesisResponse {
  thesis: Thesis | null;
  recentHistory: ThesisHistoryEntry[];
}

export interface ThesisHistoryResponse {
  history: ThesisHistoryEntry[];
  total: number;
  hasMore: boolean;
}
