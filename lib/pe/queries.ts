// Private Equity Database Queries

import { query, queryOne, transaction } from '../db';
import { PoolClient } from 'pg';
import {
  PECompany,
  PEInvestment,
  PEThesis,
  PEThesisBreakCondition,
  PEThesisHistory,
  PEMonitoring,
  PEContact,
  PEBroker,
  PECommunication,
  PECompanyListItem,
  PECompanyWithInvestment,
  CreatePECompanyRequest,
  UpdatePECompanyRequest,
  UpdatePEInvestmentRequest,
  UpdatePEThesisRequest,
  UpdatePEMonitoringRequest,
  CreatePEContactRequest,
  UpdatePEContactRequest,
  UpdatePEBrokerRequest,
  CreatePECommunicationRequest,
  ThesisStatus,
} from '../../types/pe';

// ============ Helper Functions ============

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

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
      c.id,
      c.company_name,
      c.company_code,
      c.sector,
      i.invested_value,
      i.current_value,
      CASE WHEN i.invested_value > 0 THEN i.current_value / i.invested_value ELSE NULL END as moic,
      t.status as thesis_status,
      (
        SELECT MAX(communication_date)
        FROM pe_communications
        WHERE company_id = c.id
      ) as last_communication_date
    FROM pe_companies c
    LEFT JOIN pe_investments i ON i.company_id = c.id
    LEFT JOIN pe_theses t ON t.company_id = c.id
    ORDER BY c.company_name ASC
  `);
  return transformRows<PECompanyListItem>(rows);
}

export async function getCompanyById(companyId: string): Promise<PECompany | null> {
  const row = await queryOne(`
    SELECT * FROM pe_companies WHERE id = $1
  `, [companyId]);
  return row ? transformRow<PECompany>(row) : null;
}

export async function getCompanyByCode(companyCode: string): Promise<PECompany | null> {
  const row = await queryOne(`
    SELECT * FROM pe_companies WHERE company_code = $1
  `, [companyCode]);
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

  if (data.companyName !== undefined) {
    sets.push(`company_name = $${idx++}`);
    values.push(data.companyName);
  }
  if (data.companyCode !== undefined) {
    sets.push(`company_code = $${idx++}`);
    values.push(data.companyCode);
  }
  if (data.sector !== undefined) {
    sets.push(`sector = $${idx++}`);
    values.push(data.sector);
  }
  if (data.subSector !== undefined) {
    sets.push(`sub_sector = $${idx++}`);
    values.push(data.subSector);
  }
  if (data.website !== undefined) {
    sets.push(`website = $${idx++}`);
    values.push(data.website);
  }
  if (data.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(data.description);
  }

  if (sets.length === 0) return getCompanyById(companyId);

  sets.push(`updated_at = NOW()`);
  values.push(companyId);

  const rows = await query(`
    UPDATE pe_companies
    SET ${sets.join(', ')}
    WHERE id = $${idx}
    RETURNING *
  `, values);

  return rows[0] ? transformRow<PECompany>(rows[0]) : null;
}

export async function deleteCompany(companyId: string): Promise<boolean> {
  const rows = await query(`
    DELETE FROM pe_companies WHERE id = $1 RETURNING id
  `, [companyId]);
  return rows.length > 0;
}

// ============ Investment Queries ============

export async function getInvestment(companyId: string): Promise<PEInvestment | null> {
  const row = await queryOne(`
    SELECT * FROM pe_investments WHERE company_id = $1
  `, [companyId]);
  return row ? transformRow<PEInvestment>(row) : null;
}

export async function upsertInvestment(companyId: string, data: UpdatePEInvestmentRequest): Promise<PEInvestment> {
  const rows = await query(`
    INSERT INTO pe_investments (
      company_id, invested_value, current_value, price_per_share, quantity_held,
      ownership_percentage, investment_date, last_valuation_date, valuation_source, currency
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (company_id) DO UPDATE SET
      invested_value = EXCLUDED.invested_value,
      current_value = EXCLUDED.current_value,
      price_per_share = EXCLUDED.price_per_share,
      quantity_held = EXCLUDED.quantity_held,
      ownership_percentage = EXCLUDED.ownership_percentage,
      investment_date = EXCLUDED.investment_date,
      last_valuation_date = EXCLUDED.last_valuation_date,
      valuation_source = EXCLUDED.valuation_source,
      currency = EXCLUDED.currency,
      updated_at = NOW()
    RETURNING *
  `, [
    companyId,
    data.investedValue,
    data.currentValue ?? null,
    data.pricePerShare ?? null,
    data.quantityHeld ?? null,
    data.ownershipPercentage ?? null,
    data.investmentDate ?? null,
    data.lastValuationDate ?? null,
    data.valuationSource ?? null,
    data.currency ?? 'INR',
  ]);
  return transformRow<PEInvestment>(rows[0]);
}

// ============ Thesis Queries ============

export async function getThesis(companyId: string): Promise<PEThesis | null> {
  const row = await queryOne(`
    SELECT * FROM pe_theses WHERE company_id = $1
  `, [companyId]);
  return row ? transformRow<PEThesis>(row) : null;
}

export async function getThesisBreakConditions(thesisId: string): Promise<PEThesisBreakCondition[]> {
  const rows = await query(`
    SELECT * FROM pe_thesis_break_conditions
    WHERE thesis_id = $1
    ORDER BY sort_order ASC, created_at ASC
  `, [thesisId]);
  return transformRows<PEThesisBreakCondition>(rows);
}

export async function getThesisHistory(
  thesisId: string,
  limit: number = 50,
  offset: number = 0
): Promise<PEThesisHistory[]> {
  const rows = await query(`
    SELECT * FROM pe_thesis_history
    WHERE thesis_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, [thesisId, limit, offset]);
  return transformRows<PEThesisHistory>(rows);
}

export async function updateThesis(
  companyId: string,
  data: UpdatePEThesisRequest,
  userEmail: string
): Promise<PEThesis> {
  return transaction(async (client: PoolClient) => {
    // Get or create thesis
    let thesis = await client.query(`
      SELECT * FROM pe_theses WHERE company_id = $1
    `, [companyId]).then(r => r.rows[0] ? transformRow<PEThesis>(r.rows[0]) : null);

    const changeGroupId = crypto.randomUUID();
    const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];

    if (!thesis) {
      // Create new thesis
      const result = await client.query(`
        INSERT INTO pe_theses (company_id, status, original_thesis, key_drivers, latest_note, last_review_date)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `, [
        companyId,
        data.status ?? 'intact',
        data.originalThesis ?? null,
        data.keyDrivers ?? null,
        data.latestNote ?? null,
      ]);
      thesis = transformRow<PEThesis>(result.rows[0]);

      // Record creation
      await client.query(`
        INSERT INTO pe_thesis_history (thesis_id, action_type, note, user_email, change_group_id)
        VALUES ($1, 'created', $2, $3, $4)
      `, [thesis.id, 'Thesis created', userEmail, changeGroupId]);
    } else {
      // Track changes
      if (data.status !== undefined && data.status !== thesis.status) {
        changes.push({ field: 'status', oldValue: thesis.status, newValue: data.status });
      }
      if (data.originalThesis !== undefined && data.originalThesis !== thesis.originalThesis) {
        changes.push({ field: 'original_thesis', oldValue: thesis.originalThesis, newValue: data.originalThesis });
      }
      if (data.keyDrivers !== undefined && data.keyDrivers !== thesis.keyDrivers) {
        changes.push({ field: 'key_drivers', oldValue: thesis.keyDrivers, newValue: data.keyDrivers });
      }
      if (data.latestNote !== undefined && data.latestNote !== thesis.latestNote) {
        changes.push({ field: 'latest_note', oldValue: thesis.latestNote, newValue: data.latestNote });
      }

      // Update thesis
      const sets: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.status !== undefined) {
        sets.push(`status = $${idx++}`);
        values.push(data.status);
      }
      if (data.originalThesis !== undefined) {
        sets.push(`original_thesis = $${idx++}`);
        values.push(data.originalThesis);
      }
      if (data.keyDrivers !== undefined) {
        sets.push(`key_drivers = $${idx++}`);
        values.push(data.keyDrivers);
      }
      if (data.latestNote !== undefined) {
        sets.push(`latest_note = $${idx++}`);
        values.push(data.latestNote);
      }

      if (sets.length > 0) {
        sets.push(`last_review_date = NOW()`);
        sets.push(`updated_at = NOW()`);
        values.push(thesis.id);

        const result = await client.query(`
          UPDATE pe_theses
          SET ${sets.join(', ')}
          WHERE id = $${idx}
          RETURNING *
        `, values);
        thesis = transformRow<PEThesis>(result.rows[0]);
      }

      // Record changes
      for (const change of changes) {
        await client.query(`
          INSERT INTO pe_thesis_history (thesis_id, action_type, field_changed, old_value, new_value, user_email, change_group_id)
          VALUES ($1, 'updated', $2, $3, $4, $5, $6)
        `, [thesis.id, change.field, change.oldValue, change.newValue, userEmail, changeGroupId]);
      }
    }

    // Handle break conditions if provided
    if (data.breakConditions !== undefined) {
      // Get existing conditions
      const existingConditions = await client.query(`
        SELECT * FROM pe_thesis_break_conditions WHERE thesis_id = $1
      `, [thesis.id]).then(r => transformRows<PEThesisBreakCondition>(r.rows));

      const existingIds = new Set(existingConditions.map(c => c.id));
      const providedIds = new Set(data.breakConditions.filter(c => c.id).map(c => c.id));

      // Delete removed conditions
      for (const existing of existingConditions) {
        if (!providedIds.has(existing.id)) {
          await client.query(`
            DELETE FROM pe_thesis_break_conditions WHERE id = $1
          `, [existing.id]);
          await client.query(`
            INSERT INTO pe_thesis_history (thesis_id, action_type, field_changed, old_value, user_email, change_group_id)
            VALUES ($1, 'break_condition_removed', 'break_condition', $2, $3, $4)
          `, [thesis.id, existing.condition, userEmail, changeGroupId]);
        }
      }

      // Upsert conditions
      for (const condition of data.breakConditions) {
        if (condition.id && existingIds.has(condition.id)) {
          // Update existing
          const existing = existingConditions.find(c => c.id === condition.id);
          if (existing && (existing.condition !== condition.condition || existing.isTriggered !== condition.isTriggered)) {
            await client.query(`
              UPDATE pe_thesis_break_conditions
              SET condition = $1, is_triggered = $2, triggered_at = $3, sort_order = $4
              WHERE id = $5
            `, [
              condition.condition,
              condition.isTriggered,
              condition.isTriggered && !existing.isTriggered ? 'NOW()' : existing.triggeredAt,
              condition.sortOrder,
              condition.id,
            ]);

            if (existing.isTriggered !== condition.isTriggered) {
              await client.query(`
                INSERT INTO pe_thesis_history (thesis_id, action_type, field_changed, old_value, new_value, note, user_email, change_group_id)
                VALUES ($1, 'break_condition_triggered', 'is_triggered', $2, $3, $4, $5, $6)
              `, [
                thesis.id,
                String(existing.isTriggered),
                String(condition.isTriggered),
                condition.condition,
                userEmail,
                changeGroupId,
              ]);
            }
          }
        } else {
          // Insert new
          await client.query(`
            INSERT INTO pe_thesis_break_conditions (thesis_id, condition, is_triggered, sort_order)
            VALUES ($1, $2, $3, $4)
          `, [thesis.id, condition.condition, condition.isTriggered, condition.sortOrder]);
          await client.query(`
            INSERT INTO pe_thesis_history (thesis_id, action_type, field_changed, new_value, user_email, change_group_id)
            VALUES ($1, 'break_condition_added', 'break_condition', $2, $3, $4)
          `, [thesis.id, condition.condition, userEmail, changeGroupId]);
        }
      }
    }

    return thesis;
  });
}

// ============ Monitoring Queries ============

export async function getMonitoring(companyId: string): Promise<PEMonitoring | null> {
  const row = await queryOne(`
    SELECT * FROM pe_monitoring WHERE company_id = $1
  `, [companyId]);
  return row ? transformRow<PEMonitoring>(row) : null;
}

export async function upsertMonitoring(companyId: string, data: UpdatePEMonitoringRequest): Promise<PEMonitoring> {
  const rows = await query(`
    INSERT INTO pe_monitoring (
      company_id, latest_earnings_update, latest_earnings_date, management_guidance,
      guidance_vs_actual, guidance_vs_actual_notes, fy26_annual_report_received,
      fy26_annual_report_date, last_audited_financials_received, latest_deck_received, latest_deck_name
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (company_id) DO UPDATE SET
      latest_earnings_update = EXCLUDED.latest_earnings_update,
      latest_earnings_date = EXCLUDED.latest_earnings_date,
      management_guidance = EXCLUDED.management_guidance,
      guidance_vs_actual = EXCLUDED.guidance_vs_actual,
      guidance_vs_actual_notes = EXCLUDED.guidance_vs_actual_notes,
      fy26_annual_report_received = EXCLUDED.fy26_annual_report_received,
      fy26_annual_report_date = EXCLUDED.fy26_annual_report_date,
      last_audited_financials_received = EXCLUDED.last_audited_financials_received,
      latest_deck_received = EXCLUDED.latest_deck_received,
      latest_deck_name = EXCLUDED.latest_deck_name,
      updated_at = NOW()
    RETURNING *
  `, [
    companyId,
    data.latestEarningsUpdate ?? null,
    data.latestEarningsDate ?? null,
    data.managementGuidance ?? null,
    data.guidanceVsActual ?? null,
    data.guidanceVsActualNotes ?? null,
    data.fy26AnnualReportReceived ?? false,
    data.fy26AnnualReportDate ?? null,
    data.lastAuditedFinancialsReceived ?? null,
    data.latestDeckReceived ?? null,
    data.latestDeckName ?? null,
  ]);
  return transformRow<PEMonitoring>(rows[0]);
}

// ============ Contact Queries ============

export async function getContacts(companyId: string): Promise<PEContact[]> {
  const rows = await query(`
    SELECT * FROM pe_contacts
    WHERE company_id = $1
    ORDER BY is_primary DESC, name ASC
  `, [companyId]);
  return transformRows<PEContact>(rows);
}

export async function getContactById(contactId: string): Promise<PEContact | null> {
  const row = await queryOne(`
    SELECT * FROM pe_contacts WHERE id = $1
  `, [contactId]);
  return row ? transformRow<PEContact>(row) : null;
}

export async function createContact(companyId: string, data: CreatePEContactRequest): Promise<PEContact> {
  const rows = await query(`
    INSERT INTO pe_contacts (
      company_id, contact_type, name, designation, email, phone, alternate_phone, notes, is_primary
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    companyId,
    data.contactType,
    data.name,
    data.designation ?? null,
    data.email ?? null,
    data.phone ?? null,
    data.alternatePhone ?? null,
    data.notes ?? null,
    data.isPrimary ?? false,
  ]);
  return transformRow<PEContact>(rows[0]);
}

export async function updateContact(contactId: string, data: UpdatePEContactRequest): Promise<PEContact | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.contactType !== undefined) {
    sets.push(`contact_type = $${idx++}`);
    values.push(data.contactType);
  }
  if (data.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(data.name);
  }
  if (data.designation !== undefined) {
    sets.push(`designation = $${idx++}`);
    values.push(data.designation);
  }
  if (data.email !== undefined) {
    sets.push(`email = $${idx++}`);
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    sets.push(`phone = $${idx++}`);
    values.push(data.phone);
  }
  if (data.alternatePhone !== undefined) {
    sets.push(`alternate_phone = $${idx++}`);
    values.push(data.alternatePhone);
  }
  if (data.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    values.push(data.notes);
  }
  if (data.isPrimary !== undefined) {
    sets.push(`is_primary = $${idx++}`);
    values.push(data.isPrimary);
  }
  if (data.lastCommunicationDate !== undefined) {
    sets.push(`last_communication_date = $${idx++}`);
    values.push(data.lastCommunicationDate);
  }

  if (sets.length === 0) return getContactById(contactId);

  sets.push(`updated_at = NOW()`);
  values.push(contactId);

  const rows = await query(`
    UPDATE pe_contacts
    SET ${sets.join(', ')}
    WHERE id = $${idx}
    RETURNING *
  `, values);

  return rows[0] ? transformRow<PEContact>(rows[0]) : null;
}

export async function deleteContact(contactId: string): Promise<boolean> {
  const rows = await query(`
    DELETE FROM pe_contacts WHERE id = $1 RETURNING id
  `, [contactId]);
  return rows.length > 0;
}

// ============ Broker Queries ============

export async function getBroker(companyId: string): Promise<PEBroker | null> {
  const row = await queryOne(`
    SELECT * FROM pe_brokers WHERE company_id = $1
  `, [companyId]);
  return row ? transformRow<PEBroker>(row) : null;
}

export async function upsertBroker(companyId: string, data: UpdatePEBrokerRequest): Promise<PEBroker> {
  const rows = await query(`
    INSERT INTO pe_brokers (company_id, broker_name, broker_firm, broker_email, broker_phone, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (company_id) DO UPDATE SET
      broker_name = EXCLUDED.broker_name,
      broker_firm = EXCLUDED.broker_firm,
      broker_email = EXCLUDED.broker_email,
      broker_phone = EXCLUDED.broker_phone,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING *
  `, [
    companyId,
    data.brokerName,
    data.brokerFirm ?? null,
    data.brokerEmail ?? null,
    data.brokerPhone ?? null,
    data.notes ?? null,
  ]);
  return transformRow<PEBroker>(rows[0]);
}

export async function deleteBroker(companyId: string): Promise<boolean> {
  const rows = await query(`
    DELETE FROM pe_brokers WHERE company_id = $1 RETURNING id
  `, [companyId]);
  return rows.length > 0;
}

// ============ Communication Queries ============

export async function getCommunications(
  companyId: string,
  limit: number = 50,
  offset: number = 0
): Promise<PECommunication[]> {
  const rows = await query(`
    SELECT * FROM pe_communications
    WHERE company_id = $1
    ORDER BY communication_date DESC
    LIMIT $2 OFFSET $3
  `, [companyId, limit, offset]);
  return transformRows<PECommunication>(rows);
}

export async function getCommunicationById(communicationId: string): Promise<PECommunication | null> {
  const row = await queryOne(`
    SELECT * FROM pe_communications WHERE id = $1
  `, [communicationId]);
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
    companyId,
    data.communicationType,
    data.subject ?? null,
    data.summary ?? null,
    data.detailedNotes ?? null,
    data.communicationDate,
    data.participants ?? null,
    data.followUpRequired ?? false,
    data.followUpDate ?? null,
    data.followUpNotes ?? null,
    userEmail,
  ]);
  return transformRow<PECommunication>(rows[0]);
}

export async function updateCommunication(
  communicationId: string,
  data: Partial<CreatePECommunicationRequest>
): Promise<PECommunication | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.communicationType !== undefined) {
    sets.push(`communication_type = $${idx++}`);
    values.push(data.communicationType);
  }
  if (data.subject !== undefined) {
    sets.push(`subject = $${idx++}`);
    values.push(data.subject);
  }
  if (data.summary !== undefined) {
    sets.push(`summary = $${idx++}`);
    values.push(data.summary);
  }
  if (data.detailedNotes !== undefined) {
    sets.push(`detailed_notes = $${idx++}`);
    values.push(data.detailedNotes);
  }
  if (data.communicationDate !== undefined) {
    sets.push(`communication_date = $${idx++}`);
    values.push(data.communicationDate);
  }
  if (data.participants !== undefined) {
    sets.push(`participants = $${idx++}`);
    values.push(data.participants);
  }
  if (data.followUpRequired !== undefined) {
    sets.push(`follow_up_required = $${idx++}`);
    values.push(data.followUpRequired);
  }
  if (data.followUpDate !== undefined) {
    sets.push(`follow_up_date = $${idx++}`);
    values.push(data.followUpDate);
  }
  if (data.followUpNotes !== undefined) {
    sets.push(`follow_up_notes = $${idx++}`);
    values.push(data.followUpNotes);
  }

  if (sets.length === 0) return getCommunicationById(communicationId);

  sets.push(`updated_at = NOW()`);
  values.push(communicationId);

  const rows = await query(`
    UPDATE pe_communications
    SET ${sets.join(', ')}
    WHERE id = $${idx}
    RETURNING *
  `, values);

  return rows[0] ? transformRow<PECommunication>(rows[0]) : null;
}

export async function deleteCommunication(communicationId: string): Promise<boolean> {
  const rows = await query(`
    DELETE FROM pe_communications WHERE id = $1 RETURNING id
  `, [communicationId]);
  return rows.length > 0;
}

// ============ Aggregation Queries ============

export async function getPortfolioSummary(): Promise<{
  totalInvested: number;
  totalCurrentValue: number;
  companyCount: number;
  avgMoic: number | null;
}> {
  const row = await queryOne(`
    SELECT
      COALESCE(SUM(invested_value), 0) as total_invested,
      COALESCE(SUM(current_value), 0) as total_current_value,
      COUNT(DISTINCT company_id) as company_count,
      AVG(CASE WHEN invested_value > 0 THEN current_value / invested_value ELSE NULL END) as avg_moic
    FROM pe_investments
  `);

  return {
    totalInvested: Number(row?.total_invested || 0),
    totalCurrentValue: Number(row?.total_current_value || 0),
    companyCount: Number(row?.company_count || 0),
    avgMoic: row?.avg_moic ? Number(row.avg_moic) : null,
  };
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
