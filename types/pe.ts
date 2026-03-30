// Private Equity Tracker Types

// ============ Core Entities ============

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
}

export interface PEInvestment {
  id: string;
  companyId: string;
  investedValue: number;
  currentValue: number | null;
  pricePerShare: number | null;
  quantityHeld: number | null;
  ownershipPercentage: number | null;
  investmentDate: string | null;
  lastValuationDate: string | null;
  valuationSource: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export type ThesisStatus = 'intact' | 'monitor' | 'broken';

export interface PEThesis {
  id: string;
  companyId: string;
  status: ThesisStatus;
  originalThesis: string | null;
  keyDrivers: string | null;
  latestNote: string | null;
  lastReviewDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PEThesisBreakCondition {
  id: string;
  thesisId: string;
  condition: string;
  isTriggered: boolean;
  triggeredAt: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface PEThesisHistory {
  id: string;
  thesisId: string;
  actionType: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  userEmail: string | null;
  changeGroupId: string | null;
  createdAt: string;
}

export type GuidanceVsActual = 'ahead' | 'on_track' | 'behind' | 'missed';

export interface PEMonitoring {
  id: string;
  companyId: string;
  latestEarningsUpdate: string | null;
  latestEarningsDate: string | null;
  managementGuidance: string | null;
  guidanceVsActual: GuidanceVsActual | null;
  guidanceVsActualNotes: string | null;
  fy26AnnualReportReceived: boolean;
  fy26AnnualReportDate: string | null;
  lastAuditedFinancialsReceived: string | null;
  latestDeckReceived: string | null;
  latestDeckName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ContactType = 'company_poc' | 'broker' | 'board_member' | 'advisor' | 'other';

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

export interface PEBroker {
  id: string;
  companyId: string;
  brokerName: string;
  brokerFirm: string | null;
  brokerEmail: string | null;
  brokerPhone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CommunicationType =
  | 'email'
  | 'call'
  | 'meeting'
  | 'site_visit'
  | 'board_meeting'
  | 'document_received'
  | 'note'
  | 'other';

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

// ============ Composite Types ============

export interface PECompanyWithInvestment extends PECompany {
  investment: PEInvestment | null;
  thesis: Pick<PEThesis, 'status'> | null;
}

export interface PECompanyDetail {
  company: PECompany;
  investment: PEInvestment | null;
  thesis: PEThesis | null;
  thesisBreakConditions: PEThesisBreakCondition[];
  monitoring: PEMonitoring | null;
}

export interface PEThesisWithConditions extends PEThesis {
  breakConditions: PEThesisBreakCondition[];
}

// ============ Calculated Metrics ============

export interface PEMetrics {
  moic: number | null;
  irr: number | null;
  totalGainLoss: number | null;
  totalGainLossPercentage: number | null;
}

// ============ API Request/Response Types ============

export interface CreatePECompanyRequest {
  companyName: string;
  companyCode: string;
  sector?: string;
  subSector?: string;
  website?: string;
  description?: string;
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
  quantityHeld?: number | null;
  ownershipPercentage?: number | null;
  investmentDate?: string | null;
  lastValuationDate?: string | null;
  valuationSource?: string | null;
  currency?: string;
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
  fy26AnnualReportReceived?: boolean;
  fy26AnnualReportDate?: string | null;
  lastAuditedFinancialsReceived?: string | null;
  latestDeckReceived?: string | null;
  latestDeckName?: string | null;
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

export interface UpdatePEBrokerRequest {
  brokerName: string;
  brokerFirm?: string | null;
  brokerEmail?: string | null;
  brokerPhone?: string | null;
  notes?: string | null;
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

// ============ List Response Types ============

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
}

export interface PEThesisHistoryItem {
  id: string;
  actionType: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  userEmail: string | null;
  createdAt: string;
}
