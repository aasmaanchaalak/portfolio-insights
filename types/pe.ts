// Private Equity Tracker Types

export type ThesisStatus = 'intact' | 'monitor' | 'broken';
export type GuidanceVsActual = 'ahead' | 'on_track' | 'behind' | 'missed';
// Funding stage (factsheet: grouped Early = seed/A, Growth = B/C, Late = D+/pre-IPO)
export type PEStage = 'seed' | 'series_a' | 'series_b' | 'series_c' | 'series_d_plus' | 'pre_ipo' | 'other';
// Expected exit horizon — drives the factsheet liquidity profile (illiquid < 3yr / > 3yr)
export type PEExitHorizon = 'lt_3yr' | 'gt_3yr';
export type ContactType = 'company_poc' | 'broker' | 'board_member' | 'advisor' | 'other';
export type CommunicationType = 'email' | 'call' | 'meeting' | 'site_visit' | 'board_meeting' | 'document_received' | 'note' | 'other';

// ============ Break Condition (stored as JSONB on PECompany) ============

export interface PEThesisBreakCondition {
  id: string;
  condition: string;
  isTriggered: boolean;
  triggeredAt: string | null;
  sortOrder: number;
}

// ============ Valuation Table (stored as JSONB on PECompany) ============

export interface ValuationRow {
  id: string;
  label: string;
  order: number;
}

export interface ValuationColumn {
  id: string;
  year: string;
  order: number;
}

export interface ValuationTableData {
  rows: ValuationRow[];
  columns: ValuationColumn[];
  cells: Record<string, number | null>;
}

// ============ Core Entity: Single source of truth ============

export interface PECompany {
  id: string;
  companyName: string;
  companyCode: string;
  sector: string | null;
  subSector: string | null;
  website: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;

  // Investment
  investedValue: number | null;
  currentValue: number | null;
  pricePerShare: number | null;
  currentPricePerShare: number | null;
  quantityHeld: number | null;
  ownershipPercentage: number | null;
  investmentDate: string | null;
  investmentValuation: number | null;
  currency: string;
  stage: PEStage | null;
  exitHorizon: PEExitHorizon | null;

  // Exit
  isExited: boolean;
  exitDate: string | null;
  exitValue: number | null;

  // Thesis
  thesisStatus: ThesisStatus | null;
  originalThesis: string | null;
  keyDrivers: string | null;
  latestNote: string | null;
  lastReviewDate: string | null;
  breakConditions: PEThesisBreakCondition[];

  // Monitoring
  latestEarningsUpdate: string | null;
  latestEarningsDate: string | null;
  managementGuidance: string | null;
  guidanceVsActual: GuidanceVsActual | null;
  guidanceVsActualNotes: string | null;
  drhpFiled: boolean;
  drhpFiledDate: string | null;
  drhpLink: string | null;
  fy26AnnualReportReceived: boolean;
  fy26AnnualReportDate: string | null;
  fy25AnnualReportReceived: boolean;
  fy25AnnualReportDate: string | null;
  lastAuditedFinancialsReceived: string | null;
  latestDeckReceived: string | null;
  latestDeckName: string | null;

  // Broker
  brokerName: string | null;
  brokerFirm: string | null;
  brokerEmail: string | null;
  brokerPhone: string | null;
  brokerNotes: string | null;

  // Valuation table
  valuationTable: ValuationTableData | null;
}

// ============ Broker (returned by broker API, extracted from PECompany) ============

export interface PEBroker {
  companyId: string;
  brokerName: string;
  brokerFirm: string | null;
  brokerEmail: string | null;
  brokerPhone: string | null;
  notes: string | null;
}

// ============ Contacts ============

export interface PEContact {
  id: string;
  companyId: string;
  contactType: ContactType;
  name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  notes: string | null;
  isPrimary: boolean;
  lastCommunicationDate: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============ Communications ============

export interface PECommunication {
  id: string;
  companyId: string;
  communicationType: CommunicationType;
  subject: string | null;
  summary: string | null;
  detailedNotes: string | null;
  communicationDate: string;
  participants: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
  followUpNotes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============ Computed Metrics ============

export interface PEMetrics {
  moic: number | null;
  irr: number | null;
  totalGainLoss: number | null;
  totalGainLossPercentage: number | null;
}

// ============ Factsheet Aggregation (private sleeve) ============

export interface PEFactsheetHolding {
  companyName: string;
  sector: string | null;
  stage: PEStage | null;
  currentValue: number;
  investmentDate: string | null;
  navPctOfSleeve: number | null;
}

export interface PEFactsheetSummary {
  paidIn: number;          // total invested across ALL companies (held + exited)
  currentNav: number;      // sum of current value of held companies
  distributed: number;     // sum of exit proceeds from exited companies
  heldCount: number;
  exitedCount: number;
  dpi: number | null;      // distributed / paid-in
  tvpi: number | null;     // (distributed + current NAV) / paid-in
  moic: number | null;     // gross portfolio multiple (== tvpi)
  irr: number | null;      // blended XIRR across companies with an investment date
  irrCoverage: number;     // # of companies included in the IRR calc
  topHoldings: PEFactsheetHolding[];
  byStage: { early: number; growth: number; late: number; other: number }; // % of NAV
  byVintage: { label: string; pct: number }[];                             // % of NAV per year
  liquidity: { lt3yr: number; gt3yr: number; unclassified: number };       // NAV (₹) of held by horizon
}

// ============ List View ============

export interface PECompanyListItem {
  id: string;
  companyName: string;
  companyCode: string;
  sector: string | null;
  investedValue: number | null;
  currentValue: number | null;
  moic: number | null;
  thesisStatus: ThesisStatus | null;
  lastCommunicationDate: string | null;
  brokerName: string | null;
  drhpFiled: boolean;
  fy26AnnualReportReceived: boolean;
  fy25AnnualReportReceived: boolean;
  isExited: boolean;
  exitDate: string | null;
  exitValue: number | null;
}

// ============ Request Types ============

export interface CreatePECompanyRequest {
  companyName: string;
  companyCode: string;
  sector?: string | null;
  subSector?: string | null;
  website?: string | null;
  description?: string | null;
}

export interface UpdatePECompanyRequest {
  companyName?: string;
  companyCode?: string;
  sector?: string | null;
  subSector?: string | null;
  website?: string | null;
  description?: string | null;
}

export interface UpdatePEInvestmentRequest {
  investedValue: number;
  currentValue?: number | null;
  pricePerShare?: number | null;
  currentPricePerShare?: number | null;
  quantityHeld?: number | null;
  ownershipPercentage?: number | null;
  investmentDate?: string | null;
  investmentValuation?: number | null;
  currency?: string;
  stage?: PEStage | null;
  exitHorizon?: PEExitHorizon | null;
}

export interface UpdatePEExitRequest {
  isExited: boolean;
  exitDate?: string | null;
  exitValue?: number | null;
}

export interface UpdatePEThesisRequest {
  status?: ThesisStatus;
  originalThesis?: string | null;
  keyDrivers?: string | null;
  latestNote?: string | null;
  breakConditions?: {
    id?: string;
    condition: string;
    isTriggered: boolean;
    sortOrder: number;
  }[];
}

export interface UpdatePEMonitoringRequest {
  latestEarningsUpdate?: string | null;
  latestEarningsDate?: string | null;
  managementGuidance?: string | null;
  guidanceVsActual?: GuidanceVsActual | null;
  guidanceVsActualNotes?: string | null;
  drhpFiled?: boolean;
  drhpFiledDate?: string | null;
  drhpLink?: string | null;
  fy26AnnualReportReceived?: boolean;
  fy26AnnualReportDate?: string | null;
  fy25AnnualReportReceived?: boolean;
  fy25AnnualReportDate?: string | null;
  lastAuditedFinancialsReceived?: string | null;
  latestDeckReceived?: string | null;
  latestDeckName?: string | null;
}

export interface UpdatePEBrokerRequest {
  brokerName: string;
  brokerFirm?: string | null;
  brokerEmail?: string | null;
  brokerPhone?: string | null;
  notes?: string | null;
}

export interface CreatePEContactRequest {
  contactType: ContactType;
  name: string;
  designation?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
  notes?: string;
  isPrimary?: boolean;
}

export interface UpdatePEContactRequest {
  contactType?: ContactType;
  name?: string;
  designation?: string | null;
  email?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
  lastCommunicationDate?: string | null;
}

export interface CreatePECommunicationRequest {
  communicationType: CommunicationType;
  subject?: string;
  summary?: string;
  detailedNotes?: string;
  communicationDate: string;
  participants?: string;
  followUpRequired?: boolean;
  followUpDate?: string;
  followUpNotes?: string;
}
