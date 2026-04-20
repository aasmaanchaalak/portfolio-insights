export type PipelineStatus =
  | 'captured'
  | 'triaged'
  | 'studying'
  | 'tracking'
  | 'conviction'
  | 'exited_watch'
  | 'killed';

export type PipelinePriority = 'high' | 'medium' | 'low';

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
  addedBy: string;
  assignedTo: string | null;
  source: string | null;
  whyInteresting: string | null;
  priceAtAdd: number | null;
  currentPrice: number | null;
  status: PipelineStatus;
  priority: PipelinePriority;
  decision: string | null;
  decisionReason: string | null;
  triggerCondition: string | null;
  dateAdded: string;
  statusChangedDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineNote {
  id: string;
  ideaId: string;
  noteText: string;
  addedBy: string;
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
  addedBy: string;
  assignedTo?: string | null;
  source?: string | null;
  whyInteresting?: string | null;
  priceAtAdd?: number | null;
  status?: PipelineStatus;
  priority?: PipelinePriority;
  decision?: string | null;
  decisionReason?: string | null;
  triggerCondition?: string | null;
  dateAdded?: string;
}

export interface UpdateIdeaRequest extends Partial<CreateIdeaRequest> {}

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
