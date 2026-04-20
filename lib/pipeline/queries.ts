import { query, queryOne } from '../db';
import {
  PipelineIdea,
  PipelineNote,
  GuidanceEntry,
  CreateIdeaRequest,
  UpdateIdeaRequest,
  CreateGuidanceRequest,
} from '../../types/pipeline';

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

function transformRow<T>(row: any): T {
  if (!row) return row;
  const result: any = {};
  for (const key of Object.keys(row)) {
    const val = row[key];
    result[toCamelCase(key)] =
      val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)
        ? val
        : val;
  }
  return result as T;
}

function num(v: any): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function toIdea(row: any): PipelineIdea {
  return {
    id: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    addedBy: row.added_by,
    assignedTo: row.assigned_to,
    source: row.source,
    whyInteresting: row.why_interesting,
    priceAtAdd: num(row.price_at_add),
    currentPrice: num(row.current_price),
    status: row.status,
    priority: row.priority,
    decision: row.decision,
    decisionReason: row.decision_reason,
    triggerCondition: row.trigger_condition,
    dateAdded: row.date_added,
    statusChangedDate: row.status_changed_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toNote(row: any): PipelineNote {
  return {
    id: row.id,
    ideaId: row.idea_id,
    noteText: row.note_text,
    addedBy: row.added_by,
    createdAt: row.created_at,
  };
}

function toGuidance(row: any): GuidanceEntry {
  return {
    id: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    metric: row.metric,
    guidedValue: num(row.guided_value),
    guidedUnit: row.guided_unit,
    currentValue: num(row.current_value),
    timeframe: row.timeframe,
    sourceContext: row.source_context,
    dateAdded: row.date_added,
    updatedAt: row.updated_at,
  };
}

// ============ Ideas ============

export async function listIdeas(): Promise<PipelineIdea[]> {
  const rows = await query(`
    SELECT * FROM pipeline_ideas ORDER BY
      CASE status
        WHEN 'conviction' THEN 1
        WHEN 'tracking' THEN 2
        WHEN 'studying' THEN 3
        WHEN 'triaged' THEN 4
        WHEN 'captured' THEN 5
        WHEN 'exited_watch' THEN 6
        WHEN 'killed' THEN 7
      END,
      date_added DESC
  `);
  return rows.map(toIdea);
}

export async function getIdeaById(ideaId: string): Promise<PipelineIdea | null> {
  const row = await queryOne(`SELECT * FROM pipeline_ideas WHERE id = $1`, [ideaId]);
  return row ? toIdea(row) : null;
}

export async function createIdea(data: CreateIdeaRequest): Promise<PipelineIdea> {
  const rows = await query(`
    INSERT INTO pipeline_ideas (
      ticker, company_name, added_by, assigned_to, source, why_interesting,
      price_at_add, status, priority, decision, decision_reason, trigger_condition, date_added
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *
  `, [
    data.ticker.toUpperCase(), data.companyName, data.addedBy,
    data.assignedTo || null, data.source || null, data.whyInteresting || null,
    data.priceAtAdd || null,
    data.status || 'captured', data.priority || 'medium',
    data.decision || null, data.decisionReason || null, data.triggerCondition || null,
    data.dateAdded || new Date().toISOString().split('T')[0],
  ]);
  return toIdea(rows[0]);
}

export async function updateIdea(ideaId: string, data: UpdateIdeaRequest, prevStatus?: string): Promise<PipelineIdea | null> {
  const statusChanged = data.status && data.status !== prevStatus;
  const rows = await query(`
    UPDATE pipeline_ideas SET
      ticker = COALESCE($1, ticker),
      company_name = COALESCE($2, company_name),
      added_by = COALESCE($3, added_by),
      assigned_to = $4,
      source = $5,
      why_interesting = $6,
      price_at_add = $7,
      status = COALESCE($8, status),
      priority = COALESCE($9, priority),
      decision = $10,
      decision_reason = $11,
      trigger_condition = $12,
      date_added = COALESCE($13, date_added),
      status_changed_date = CASE WHEN $14 THEN CURRENT_DATE ELSE status_changed_date END,
      updated_at = NOW()
    WHERE id = $15
    RETURNING *
  `, [
    data.ticker ? data.ticker.toUpperCase() : null,
    data.companyName || null,
    data.addedBy || null,
    'assignedTo' in data ? (data.assignedTo || null) : undefined,
    'source' in data ? (data.source || null) : undefined,
    'whyInteresting' in data ? (data.whyInteresting || null) : undefined,
    'priceAtAdd' in data ? (data.priceAtAdd || null) : undefined,
    data.status || null,
    data.priority || null,
    'decision' in data ? (data.decision || null) : undefined,
    'decisionReason' in data ? (data.decisionReason || null) : undefined,
    'triggerCondition' in data ? (data.triggerCondition || null) : undefined,
    data.dateAdded || null,
    statusChanged,
    ideaId,
  ]);
  return rows.length > 0 ? toIdea(rows[0]) : null;
}

export async function deleteIdea(ideaId: string): Promise<boolean> {
  const rows = await query(`DELETE FROM pipeline_ideas WHERE id = $1 RETURNING id`, [ideaId]);
  return rows.length > 0;
}

// ============ Notes ============

export async function getNotesByIdea(ideaId: string): Promise<PipelineNote[]> {
  const rows = await query(`
    SELECT * FROM pipeline_notes WHERE idea_id = $1 ORDER BY created_at DESC
  `, [ideaId]);
  return rows.map(toNote);
}

export async function createNote(ideaId: string, noteText: string, addedBy: string): Promise<PipelineNote> {
  const rows = await query(`
    INSERT INTO pipeline_notes (idea_id, note_text, added_by)
    VALUES ($1, $2, $3) RETURNING *
  `, [ideaId, noteText, addedBy]);
  return toNote(rows[0]);
}

export async function deleteNote(noteId: string): Promise<boolean> {
  const rows = await query(`DELETE FROM pipeline_notes WHERE id = $1 RETURNING id`, [noteId]);
  return rows.length > 0;
}

// ============ Guidance ============

export async function listGuidance(): Promise<GuidanceEntry[]> {
  const rows = await query(`SELECT * FROM guidance_tracker ORDER BY ticker, metric`);
  return rows.map(toGuidance);
}

export async function createGuidance(data: CreateGuidanceRequest): Promise<GuidanceEntry> {
  const rows = await query(`
    INSERT INTO guidance_tracker (ticker, company_name, metric, guided_value, guided_unit, current_value, timeframe, source_context)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [
    data.ticker.toUpperCase(), data.companyName, data.metric,
    data.guidedValue || null, data.guidedUnit || null, data.currentValue || null,
    data.timeframe || null, data.sourceContext || null,
  ]);
  return toGuidance(rows[0]);
}

export async function updateGuidance(guidanceId: string, data: Partial<CreateGuidanceRequest>): Promise<GuidanceEntry | null> {
  const rows = await query(`
    UPDATE guidance_tracker SET
      ticker = COALESCE($1, ticker),
      company_name = COALESCE($2, company_name),
      metric = COALESCE($3, metric),
      guided_value = $4,
      guided_unit = $5,
      current_value = $6,
      timeframe = $7,
      source_context = $8,
      updated_at = NOW()
    WHERE id = $9 RETURNING *
  `, [
    data.ticker ? data.ticker.toUpperCase() : null,
    data.companyName || null,
    data.metric || null,
    'guidedValue' in data ? (data.guidedValue ?? null) : undefined,
    'guidedUnit' in data ? (data.guidedUnit || null) : undefined,
    'currentValue' in data ? (data.currentValue ?? null) : undefined,
    'timeframe' in data ? (data.timeframe || null) : undefined,
    'sourceContext' in data ? (data.sourceContext || null) : undefined,
    guidanceId,
  ]);
  return rows.length > 0 ? toGuidance(rows[0]) : null;
}

export async function deleteGuidance(guidanceId: string): Promise<boolean> {
  const rows = await query(`DELETE FROM guidance_tracker WHERE id = $1 RETURNING id`, [guidanceId]);
  return rows.length > 0;
}

// ============ Price Cache ============

export async function getPriceCached(ticker: string): Promise<{ closePrice: number; priceDate: string } | null> {
  const row = await queryOne(`SELECT close_price, price_date FROM price_cache WHERE ticker = $1`, [ticker.toUpperCase()]);
  return row ? { closePrice: Number(row.close_price), priceDate: row.price_date } : null;
}

export async function upsertPriceCache(ticker: string, closePrice: number, priceDate: string): Promise<void> {
  await query(`
    INSERT INTO price_cache (ticker, close_price, price_date, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (ticker) DO UPDATE SET close_price = $2, price_date = $3, updated_at = NOW()
  `, [ticker.toUpperCase(), closePrice, priceDate]);
}
