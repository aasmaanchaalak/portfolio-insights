export type PipelineStage = 'new' | 'research' | 'waiting' | 'closed';

export type PipelineOutcome = 'bought' | 'passed';

export type PipelinePriority = 'high' | 'medium' | 'low';

export type PipelineAlert =
  | { type: 'price'; value: number }
  | { type: 'event'; text: string; dueDate: string | null };

export type GuidanceMetric =
  | 'Revenue'
  | 'EBITDA'
  | 'PAT'
  | 'Market Cap'
  | 'Sales Volume'
  | 'Margin %'
  | 'Other';

export interface PipelineIdea {
  id: string;
  ticker: string;
  companyName: string;
  exchange: string | null;
  addedBy: string;
  owner: string;
  source: string | null;
  why: string | null;
  priceAtAdd: number | null;
  currentPrice: number | null;
  stage: PipelineStage;
  outcome: PipelineOutcome | null;
  tag: string | null;
  priority: PipelinePriority;
  alert: PipelineAlert | null;
  closedPrice: number | null;
  dateAdded: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export type PipelineActivityKind = 'note' | 'stage' | 'decision';

export interface PipelineNote {
  id: string;
  ideaId: string;
  noteText: string;
  addedBy: string;
  kind: PipelineActivityKind;
  attachmentIds: string[];
  createdAt: string;
}

export interface GuidanceEntry {
  id: string;
  ticker: string;
  companyName: string;
  metric: string;
  guidedValue: number | null;
  guidedUnit: string | null;
  currentValue: number | null;
  timeframe: string | null;
  sourceContext: string | null;
  dateAdded: string;
  updatedAt: string;
}

export interface CreateIdeaRequest {
  ticker: string;
  companyName: string;
  exchange?: string | null;
  addedBy: string;
  owner?: string | null;
  source?: string | null;
  why?: string | null;
  priceAtAdd?: number | null;
  stage?: PipelineStage;
  tag?: string | null;
  priority?: PipelinePriority;
  dateAdded?: string;
}

/** Partial update — only the keys present are changed. */
export interface UpdateIdeaRequest {
  companyName?: string;
  why?: string | null;
  owner?: string;
  priority?: PipelinePriority;
  stage?: PipelineStage;
  tag?: string | null;
  alert?: PipelineAlert | null;
  /** Who made the change — recorded on stage-change activity entries. */
  actor?: string;
}

export interface CreateGuidanceRequest {
  ticker: string;
  companyName: string;
  metric: string;
  guidedValue?: number | null;
  guidedUnit?: string | null;
  currentValue?: number | null;
  timeframe?: string | null;
  sourceContext?: string | null;
}
