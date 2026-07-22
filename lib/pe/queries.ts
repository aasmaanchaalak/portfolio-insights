// Private Equity Database Queries

import { query, queryOne } from '../db';
import {
  PECompany,
  PEBroker,
  PEContact,
  PECommunication,
  PECompanyListItem,
  PEThesisBreakCondition,
  CreatePECompanyRequest,
  UpdatePECompanyRequest,
  UpdatePEInvestmentRequest,
  UpdatePEExitRequest,
  UpdatePEThesisRequest,
  UpdatePEMonitoringRequest,
  UpdatePEBrokerRequest,
  CreatePEContactRequest,
  UpdatePEContactRequest,
  CreatePECommunicationRequest,
  ValuationTableData,
} from '../../types/pe';

// ============ Helpers ============

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function transformRow<T>(row: any): T {
  if (!row) return row;
  const result: any = {};
  for (const key of Object.keys(row)) {
    result[toCamelCase(key)] = row[key];
  }
  return result as T;
}

function transformRows<T>(rows: any[]): T[] {
  return rows.map(row => transformRow<T>(row));
}

// ============ Company Queries ============

export async function listCompanies(): Promise<PECompanyListItem[]> {
  const rows = await query(`
    SELECT
      id,
      company_name,
      company_code,
      sector,
      invested_value,
      current_value,
      is_exited,
      exit_date,
      exit_value,
      CASE WHEN invested_value > 0 THEN
        (CASE WHEN is_exited THEN exit_value ELSE current_value END) / invested_value
      ELSE NULL END AS moic,
      thesis_status,
      broker_name,
      drhp_filed,
      fy26_annual_report_received,
      fy25_annual_report_received,
      (
        SELECT MAX(communication_date)
        FROM pe_communications
        WHERE company_id = pe_companies.id
      ) AS last_communication_date
    FROM pe_companies
    ORDER BY company_name ASC
  `);
  return transformRows<PECompanyListItem>(rows);
}

export async function getCompanyById(companyId: string): Promise<PECompany | null> {
  const row = await queryOne(`SELECT * FROM pe_companies WHERE id = $1`, [companyId]);
  return row ? transformRow<PECompany>(row) : null;
}

export async function getCompanyByCode(companyCode: string): Promise<PECompany | null> {
  const row = await queryOne(`SELECT * FROM pe_companies WHERE company_code = $1`, [companyCode]);
  return row ? transformRow<PECompany>(row) : null;
}

export async function createCompany(data: CreatePECompanyRequest, userEmail: string): Promise<PECompany> {
  const rows = await query(`
    INSERT INTO pe_companies (company_name, company_code, sector, sub_sector, website, description, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [
    data.companyName,
    data.companyCode,
    data.sector || null,
    data.subSector || null,
    data.website || null,
    data.description || null,
    userEmail,
  ]);
  return transformRow<PECompany>(rows[0]);
}

export async function updateCompany(companyId: string, data: UpdatePECompanyRequest): Promise<PECompany | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.companyName !== undefined) { sets.push(`company_name = $${idx++}`); values.push(data.companyName); }
  if (data.companyCode !== undefined) { sets.push(`company_code = $${idx++}`); values.push(data.companyCode); }
  if (data.sector !== undefined) { sets.push(`sector = $${idx++}`); values.push(data.sector); }
  if (data.subSector !== undefined) { sets.push(`sub_sector = $${idx++}`); values.push(data.subSector); }
  if (data.website !== undefined) { sets.push(`website = $${idx++}`); values.push(data.website); }
  if (data.description !== undefined) { sets.push(`description = $${idx++}`); values.push(data.description); }

  if (sets.length === 0) return getCompanyById(companyId);

  sets.push(`updated_at = NOW()`);
  values.push(companyId);

  const rows = await query(`
    UPDATE pe_companies SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *
  `, values);

  return rows[0] ? transformRow<PECompany>(rows[0]) : null;
}

export async function deleteCompany(companyId: string): Promise<boolean> {
  const rows = await query(`DELETE FROM pe_companies WHERE id = $1 RETURNING id`, [companyId]);
  return rows.length > 0;
}

// ============ Investment Update ============

export async function updateInvestment(companyId: string, data: UpdatePEInvestmentRequest): Promise<PECompany> {
  const rows = await query(`
    UPDATE pe_companies SET
      invested_value = $1,
      current_value = $2,
      price_per_share = $3,
      current_price_per_share = $4,
      quantity_held = $5,
      ownership_percentage = $6,
      investment_date = $7,
      investment_valuation = $8,
      currency = $9,
      stage = $10,
      exit_horizon = $11,
      updated_at = NOW()
    WHERE id = $12
    RETURNING *
  `, [
    data.investedValue,
    data.currentValue ?? null,
    data.pricePerShare ?? null,
    data.currentPricePerShare ?? null,
    data.quantityHeld ?? null,
    data.ownershipPercentage ?? null,
    data.investmentDate ?? null,
    data.investmentValuation ?? null,
    data.currency ?? 'INR',
    data.stage ?? null,
    data.exitHorizon ?? null,
    companyId,
  ]);
  return transformRow<PECompany>(rows[0]);
}

// ============ Exit Update ============

export async function updateExit(companyId: string, data: UpdatePEExitRequest): Promise<PECompany> {
  const rows = await query(`
    UPDATE pe_companies SET
      is_exited = $1,
      exit_date = $2,
      exit_value = $3,
      updated_at = NOW()
    WHERE id = $4
    RETURNING *
  `, [
    data.isExited,
    data.isExited ? data.exitDate ?? null : null,
    data.isExited ? data.exitValue ?? null : null,
    companyId,
  ]);
  return transformRow<PECompany>(rows[0]);
}

// ============ Thesis Update ============

export async function updateThesis(companyId: string, data: UpdatePEThesisRequest): Promise<PECompany> {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.status !== undefined) { sets.push(`thesis_status = $${idx++}`); values.push(data.status); }
  if (data.originalThesis !== undefined) { sets.push(`original_thesis = $${idx++}`); values.push(data.originalThesis); }
  if (data.keyDrivers !== undefined) { sets.push(`key_drivers = $${idx++}`); values.push(data.keyDrivers); }
  if (data.latestNote !== undefined) { sets.push(`latest_note = $${idx++}`); values.push(data.latestNote); }

  if (data.breakConditions !== undefined) {
    // Get current break_conditions to preserve triggeredAt timestamps
    const current = await queryOne(`SELECT break_conditions FROM pe_companies WHERE id = $1`, [companyId]);
    const existing: PEThesisBreakCondition[] = current?.break_conditions || [];

    const processed: PEThesisBreakCondition[] = data.breakConditions.map((c, i) => {
      const prev = c.id ? existing.find(e => e.id === c.id) : null;
      return {
        id: c.id || crypto.randomUUID(),
        condition: c.condition,
        isTriggered: c.isTriggered,
        triggeredAt: c.isTriggered ? (prev?.triggeredAt || new Date().toISOString()) : null,
        sortOrder: c.sortOrder ?? i,
      };
    });

    sets.push(`break_conditions = $${idx++}::jsonb`);
    values.push(JSON.stringify(processed));
  }

  sets.push(`last_review_date = NOW()`);
  sets.push(`updated_at = NOW()`);
  values.push(companyId);

  const rows = await query(`
    UPDATE pe_companies SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *
  `, values);

  return transformRow<PECompany>(rows[0]);
}

// ============ Monitoring Update ============

export async function updateMonitoring(companyId: string, data: UpdatePEMonitoringRequest): Promise<PECompany> {
  const rows = await query(`
    UPDATE pe_companies SET
      latest_earnings_update = $1,
      latest_earnings_date = $2,
      management_guidance = $3,
      guidance_vs_actual = $4,
      guidance_vs_actual_notes = $5,
      drhp_filed = $6,
      drhp_filed_date = $7,
      drhp_link = $8,
      fy26_annual_report_received = $9,
      fy26_annual_report_date = $10,
      fy25_annual_report_received = $11,
      fy25_annual_report_date = $12,
      last_audited_financials_received = $13,
      latest_deck_received = $14,
      latest_deck_name = $15,
      updated_at = NOW()
    WHERE id = $16
    RETURNING *
  `, [
    data.latestEarningsUpdate ?? null,
    data.latestEarningsDate ?? null,
    data.managementGuidance ?? null,
    data.guidanceVsActual ?? null,
    data.guidanceVsActualNotes ?? null,
    data.drhpFiled ?? false,
    data.drhpFiledDate ?? null,
    data.drhpLink ?? null,
    data.fy26AnnualReportReceived ?? false,
    data.fy26AnnualReportDate ?? null,
    data.fy25AnnualReportReceived ?? false,
    data.fy25AnnualReportDate ?? null,
    data.lastAuditedFinancialsReceived ?? null,
    data.latestDeckReceived ?? null,
    data.latestDeckName ?? null,
    companyId,
  ]);
  return transformRow<PECompany>(rows[0]);
}

// ============ Broker (fields on pe_companies) ============

export async function getBroker(companyId: string): Promise<PEBroker | null> {
  const row = await queryOne(`
    SELECT id AS company_id, broker_name, broker_firm, broker_email, broker_phone, broker_notes AS notes
    FROM pe_companies WHERE id = $1 AND broker_name IS NOT NULL
  `, [companyId]);
  return row ? transformRow<PEBroker>(row) : null;
}

export async function upsertBroker(companyId: string, data: UpdatePEBrokerRequest): Promise<PEBroker> {
  const rows = await query(`
    UPDATE pe_companies SET
      broker_name = $1,
      broker_firm = $2,
      broker_email = $3,
      broker_phone = $4,
      broker_notes = $5,
      updated_at = NOW()
    WHERE id = $6
    RETURNING id AS company_id, broker_name, broker_firm, broker_email, broker_phone, broker_notes AS notes
  `, [
    data.brokerName,
    data.brokerFirm ?? null,
    data.brokerEmail ?? null,
    data.brokerPhone ?? null,
    data.notes ?? null,
    companyId,
  ]);
  return transformRow<PEBroker>(rows[0]);
}

export async function deleteBroker(companyId: string): Promise<boolean> {
  const rows = await query(`
    UPDATE pe_companies SET
      broker_name = NULL, broker_firm = NULL, broker_email = NULL,
      broker_phone = NULL, broker_notes = NULL, updated_at = NOW()
    WHERE id = $1 AND broker_name IS NOT NULL
    RETURNING id
  `, [companyId]);
  return rows.length > 0;
}

// ============ Valuation Table (field on pe_companies) ============

export async function getValuation(companyId: string): Promise<ValuationTableData | null> {
  const row = await queryOne(`SELECT valuation_table FROM pe_companies WHERE id = $1`, [companyId]);
  return row?.valuation_table ?? null;
}

export async function upsertValuation(companyId: string, data: ValuationTableData): Promise<ValuationTableData> {
  const rows = await query(`
    UPDATE pe_companies SET valuation_table = $1::jsonb, updated_at = NOW()
    WHERE id = $2 RETURNING valuation_table
  `, [JSON.stringify(data), companyId]);
  return (rows[0] as any).valuation_table;
}

// ============ Contact Queries ============

export async function getContacts(companyId: string): Promise<PEContact[]> {
  const rows = await query(`
    SELECT * FROM pe_contacts WHERE company_id = $1 ORDER BY is_primary DESC, name ASC
  `, [companyId]);
  return transformRows<PEContact>(rows);
}

export async function getContactById(contactId: string): Promise<PEContact | null> {
  const row = await queryOne(`SELECT * FROM pe_contacts WHERE id = $1`, [contactId]);
  return row ? transformRow<PEContact>(row) : null;
}

export async function createContact(companyId: string, data: CreatePEContactRequest): Promise<PEContact> {
  const rows = await query(`
    INSERT INTO pe_contacts (company_id, contact_type, name, designation, email, phone, alternate_phone, notes, is_primary)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    companyId, data.contactType, data.name,
    data.designation ?? null, data.email ?? null, data.phone ?? null,
    data.alternatePhone ?? null, data.notes ?? null, data.isPrimary ?? false,
  ]);
  return transformRow<PEContact>(rows[0]);
}

export async function updateContact(contactId: string, data: UpdatePEContactRequest): Promise<PEContact | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.contactType !== undefined) { sets.push(`contact_type = $${idx++}`); values.push(data.contactType); }
  if (data.name !== undefined) { sets.push(`name = $${idx++}`); values.push(data.name); }
  if (data.designation !== undefined) { sets.push(`designation = $${idx++}`); values.push(data.designation); }
  if (data.email !== undefined) { sets.push(`email = $${idx++}`); values.push(data.email); }
  if (data.phone !== undefined) { sets.push(`phone = $${idx++}`); values.push(data.phone); }
  if (data.alternatePhone !== undefined) { sets.push(`alternate_phone = $${idx++}`); values.push(data.alternatePhone); }
  if (data.notes !== undefined) { sets.push(`notes = $${idx++}`); values.push(data.notes); }
  if (data.isPrimary !== undefined) { sets.push(`is_primary = $${idx++}`); values.push(data.isPrimary); }
  if (data.lastCommunicationDate !== undefined) { sets.push(`last_communication_date = $${idx++}`); values.push(data.lastCommunicationDate); }

  if (sets.length === 0) return getContactById(contactId);

  sets.push(`updated_at = NOW()`);
  values.push(contactId);

  const rows = await query(`UPDATE pe_contacts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, values);
  return rows[0] ? transformRow<PEContact>(rows[0]) : null;
}

export async function deleteContact(contactId: string): Promise<boolean> {
  const rows = await query(`DELETE FROM pe_contacts WHERE id = $1 RETURNING id`, [contactId]);
  return rows.length > 0;
}

// ============ Communication Queries ============

export async function getCommunications(companyId: string, limit = 50, offset = 0): Promise<PECommunication[]> {
  const rows = await query(`
    SELECT * FROM pe_communications WHERE company_id = $1
    ORDER BY communication_date DESC LIMIT $2 OFFSET $3
  `, [companyId, limit, offset]);
  return transformRows<PECommunication>(rows);
}

export async function getCommunicationById(communicationId: string): Promise<PECommunication | null> {
  const row = await queryOne(`SELECT * FROM pe_communications WHERE id = $1`, [communicationId]);
  return row ? transformRow<PECommunication>(row) : null;
}

export async function createCommunication(
  companyId: string,
  data: CreatePECommunicationRequest,
  userEmail: string
): Promise<PECommunication> {
  const rows = await query(`
    INSERT INTO pe_communications (
      company_id, communication_type, subject, summary, detailed_notes,
      communication_date, participants, follow_up_required, follow_up_date, follow_up_notes, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `, [
    companyId, data.communicationType, data.subject || null,
    data.summary || null, data.detailedNotes || null, data.communicationDate,
    data.participants || null, data.followUpRequired ?? false,
    data.followUpDate || null, data.followUpNotes || null, userEmail,
  ]);
  return transformRow<PECommunication>(rows[0]);
}

export async function updateCommunication(
  communicationId: string,
  data: Partial<CreatePECommunicationRequest>
): Promise<PECommunication | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  const map: Record<string, string> = {
    communicationType: 'communication_type', subject: 'subject', summary: 'summary',
    detailedNotes: 'detailed_notes', communicationDate: 'communication_date',
    participants: 'participants', followUpRequired: 'follow_up_required',
    followUpDate: 'follow_up_date', followUpNotes: 'follow_up_notes',
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in data) {
      fields.push(`${col} = $${idx++}`);
      values.push((data as Record<string, unknown>)[key] ?? null);
    }
  }
  if (fields.length === 0) return getCommunicationById(communicationId);
  values.push(communicationId);
  const rows = await query(
    `UPDATE pe_communications SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows.length > 0 ? transformRow<PECommunication>(rows[0]) : null;
}

export async function deleteCommunication(communicationId: string): Promise<boolean> {
  const rows = await query(`DELETE FROM pe_communications WHERE id = $1 RETURNING id`, [communicationId]);
  return rows.length > 0;
}

// ============ Aggregation ============

export async function getPortfolioSummary(): Promise<{
  totalInvested: number;
  totalCurrentValue: number;
  companyCount: number;
  avgMoic: number | null;
}> {
  const row = await queryOne(`
    SELECT
      COALESCE(SUM(invested_value), 0) AS total_invested,
      COALESCE(SUM(current_value), 0) AS total_current_value,
      COUNT(*) AS company_count,
      AVG(CASE WHEN invested_value > 0 THEN current_value / invested_value ELSE NULL END) AS avg_moic
    FROM pe_companies
    WHERE invested_value IS NOT NULL AND NOT is_exited
  `);
  return {
    totalInvested: Number(row?.total_invested || 0),
    totalCurrentValue: Number(row?.total_current_value || 0),
    companyCount: Number(row?.company_count || 0),
    avgMoic: row?.avg_moic ? Number(row.avg_moic) : null,
  };
}

// Full company rows (all columns) — used by the factsheet aggregator.
export async function listCompaniesFull(): Promise<PECompany[]> {
  const rows = await query(`SELECT * FROM pe_companies ORDER BY company_name ASC`);
  return transformRows<PECompany>(rows);
}

export async function getPendingFollowUps(): Promise<PECommunication[]> {
  const rows = await query(`
    SELECT * FROM pe_communications
    WHERE follow_up_required = TRUE
    AND (follow_up_date IS NULL OR follow_up_date <= CURRENT_DATE + INTERVAL '7 days')
    ORDER BY follow_up_date ASC NULLS FIRST
    LIMIT 20
  `);
  return transformRows<PECommunication>(rows);
}
