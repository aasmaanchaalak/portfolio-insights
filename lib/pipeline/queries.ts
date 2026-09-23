import { query, queryOne, transaction } from '../db';
import {
  PipelineIdea,
  PipelineNote,
  PipelineAlert,
  PipelineStage,
  PipelineOutcome,
  PipelineActivityKind,
  GuidanceEntry,
  CreateIdeaRequest,
  UpdateIdeaRequest,
  CreateGuidanceRequest,
} from '../../types/pipeline';

function num(v: any): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export const STAGE_LABEL: Record<PipelineStage, string> = {
  new: 'New',
  research: 'Researching',
  waiting: 'Waiting',
  closed: 'Closed',
};

function toAlert(row: any): PipelineAlert | null {
  if (row.alert_type === 'price' && row.alert_price !== null) {
    return { type: 'price', value: Number(row.alert_price) };
  }
  if (row.alert_type === 'event') {
    return { type: 'event', text: row.alert_event || '', dueDate: row.alert_due ? dateOnly(row.alert_due) : null };
  }
  return null;
}

function dateOnly(v: any): string {
  if (v instanceof Date) {
    // DATE columns come back as local-midnight Dates.
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).split('T')[0];
}

function toIdea(row: any): PipelineIdea {
  return {
    id: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    exchange: row.exchange ?? null,
    addedBy: row.added_by,
    owner: row.assigned_to || row.added_by,
    source: row.source,
    why: row.why_interesting,
    priceAtAdd: num(row.price_at_add),
    currentPrice: num(row.current_price),
    stage: row.stage || 'new',
    outcome: row.outcome ?? null,
    tag: row.tag ?? null,
    priority: row.priority,
    alert: toAlert(row),
    closedPrice: num(row.closed_price),
    dateAdded: row.date_added,
    lastActivityAt: row.last_activity_at ?? row.updated_at,
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
    kind: row.kind || 'note',
    attachmentIds: Array.isArray(row.attachment_ids) ? row.attachment_ids : [],
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

// ============ Schema ============

// Same statements as scripts/migrations/027_pipeline_stages_alerts.sql, applied
// once per process so the redesign works where the migration hasn't been run.
// Every data step is guarded by `stage IS NULL`, so it only touches unmigrated rows.
const PRICE_IN_TRIGGER = `'(?:₹|\\m[Rr][Ss]\\.?|\\m[Bb]elow|\\m[Uu]nder|\\m[Aa]round|\\m[Nn]ear|<|@)\\s*₹?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)'`;
const SCHEMA_STATEMENTS = [
  `ALTER TABLE pipeline_ideas
     ADD COLUMN IF NOT EXISTS stage VARCHAR(10),
     ADD COLUMN IF NOT EXISTS outcome VARCHAR(10),
     ADD COLUMN IF NOT EXISTS tag VARCHAR(40),
     ADD COLUMN IF NOT EXISTS exchange VARCHAR(8),
     ADD COLUMN IF NOT EXISTS alert_type VARCHAR(10),
     ADD COLUMN IF NOT EXISTS alert_price DECIMAL(12,2),
     ADD COLUMN IF NOT EXISTS alert_event TEXT,
     ADD COLUMN IF NOT EXISTS alert_due DATE,
     ADD COLUMN IF NOT EXISTS closed_price DECIMAL(12,2),
     ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE`,
  // Left by an interim version of this change; never held data.
  `ALTER TABLE pipeline_ideas
     DROP COLUMN IF EXISTS alert_direction,
     DROP COLUMN IF EXISTS event_label,
     DROP COLUMN IF EXISTS event_date`,
  `ALTER TABLE pipeline_notes
     ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'note',
     ADD COLUMN IF NOT EXISTS attachment_ids JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `INSERT INTO pipeline_notes (idea_id, note_text, added_by, kind, created_at)
   SELECT id, CONCAT_WS(': ', NULLIF(decision, ''), NULLIF(decision_reason, '')),
          COALESCE(assigned_to, added_by), 'decision', COALESCE(updated_at, NOW())
   FROM pipeline_ideas
   WHERE stage IS NULL
     AND (COALESCE(decision, '') <> '' OR COALESCE(decision_reason, '') <> '')`,
  `UPDATE pipeline_ideas
   SET alert_type = 'price',
       alert_price = REPLACE(SUBSTRING(trigger_condition FROM ${PRICE_IN_TRIGGER}), ',', '')::numeric
   WHERE stage IS NULL AND status <> 'killed'
     AND SUBSTRING(trigger_condition FROM ${PRICE_IN_TRIGGER}) IS NOT NULL`,
  `UPDATE pipeline_ideas
   SET alert_type = 'event', alert_event = trigger_condition
   WHERE stage IS NULL AND status <> 'killed' AND alert_type IS NULL
     AND COALESCE(TRIM(trigger_condition), '') <> ''`,
  `UPDATE pipeline_ideas pi
   SET stage = CASE pi.status
                 WHEN 'captured' THEN 'new'
                 WHEN 'triaged' THEN 'research'
                 WHEN 'studying' THEN 'research'
                 WHEN 'killed' THEN 'closed'
                 WHEN 'exited_watch' THEN 'closed'
                 ELSE 'waiting'
               END,
       outcome = CASE WHEN pi.status = 'killed' THEN 'passed' END,
       tag = CASE WHEN pi.status = 'exited_watch' THEN 'Exited' ELSE pi.tag END,
       assigned_to = COALESCE(pi.assigned_to, pi.added_by),
       last_activity_at = COALESCE(pi.last_activity_at, GREATEST(
         pi.status_changed_date::timestamptz,
         pi.date_added::timestamptz,
         COALESCE((SELECT MAX(created_at) FROM pipeline_notes pn WHERE pn.idea_id = pi.id), pi.date_added::timestamptz)
       ))
   WHERE pi.stage IS NULL`,
];

let schemaReady: Promise<void> | null = null;
function ensurePipelineSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = transaction(async client => {
      // Serialise across processes so the data steps never run twice at once.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('pipeline_schema_027'))`);
      for (const sql of SCHEMA_STATEMENTS) await client.query(sql);
    }).catch(err => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

// ============ Ideas ============

export async function listIdeas(): Promise<PipelineIdea[]> {
  await ensurePipelineSchema();
  const rows = await query(`SELECT * FROM pipeline_ideas ORDER BY last_activity_at DESC NULLS LAST`);
  return rows.map(toIdea);
}

export async function getIdeaById(ideaId: string): Promise<PipelineIdea | null> {
  await ensurePipelineSchema();
  const row = await queryOne(`SELECT * FROM pipeline_ideas WHERE id = $1`, [ideaId]);
  return row ? toIdea(row) : null;
}

export async function getIdeaByTicker(ticker: string): Promise<PipelineIdea | null> {
  await ensurePipelineSchema();
  const row = await queryOne(`SELECT * FROM pipeline_ideas WHERE UPPER(ticker) = UPPER($1) LIMIT 1`, [ticker]);
  return row ? toIdea(row) : null;
}

/**
 * Move a company into Closed with an "Exited" tag when its portfolio holding is
 * fully sold. If an idea already exists for the ticker it is moved (unless it is
 * already there); otherwise a fresh one is created. Any alert is kept, so a
 * re-entry price still triggers. Never removes or reverts an idea — reversal is
 * handled manually.
 */
export async function upsertExitedWatchIdea(params: {
  ticker: string;
  companyName: string;
  addedBy: string;
  priceAtAdd?: number | null;
}): Promise<{ idea: PipelineIdea; action: 'created' | 'moved' | 'skipped' }> {
  const existing = await getIdeaByTicker(params.ticker);
  if (existing) {
    if (existing.stage === 'closed' && existing.tag === 'Exited') {
      return { idea: existing, action: 'skipped' };
    }
    const rows = await query(`
      UPDATE pipeline_ideas
      SET stage = 'closed', tag = 'Exited', outcome = NULL,
          closed_price = COALESCE($2, current_price),
          status_changed_date = CURRENT_DATE, updated_at = NOW(), last_activity_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [existing.id, params.priceAtAdd ?? null]);
    await logActivity(existing.id, 'stage', 'Moved to Closed — exited from portfolio', params.addedBy);
    return { idea: toIdea(rows[0]), action: 'moved' };
  }
  const created = await createIdea({
    ticker: params.ticker,
    companyName: params.companyName,
    addedBy: params.addedBy,
    source: 'Exited position',
    priceAtAdd: params.priceAtAdd ?? null,
    stage: 'closed',
    tag: 'Exited',
    priority: 'low',
  });
  return { idea: created, action: 'created' };
}

export async function createIdea(data: CreateIdeaRequest): Promise<PipelineIdea> {
  await ensurePipelineSchema();
  const rows = await query(`
    INSERT INTO pipeline_ideas (
      ticker, company_name, exchange, added_by, assigned_to, source, why_interesting,
      price_at_add, current_price, stage, tag, priority, date_added, last_activity_at, closed_price
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,NOW(),
      CASE WHEN $9 = 'closed' THEN $8::numeric END)
    RETURNING *
  `, [
    data.ticker.toUpperCase(), data.companyName, data.exchange || null,
    data.addedBy, data.owner || data.addedBy, data.source || null,
    data.why?.trim() || 'No reason noted yet',
    data.priceAtAdd || null,
    data.stage || 'new', data.tag || null, data.priority || 'medium',
    data.dateAdded || new Date().toISOString().split('T')[0],
  ]);
  return toIdea(rows[0]);
}

/** Partial update: only keys present in `data` change. Stage changes are logged. */
export async function updateIdea(ideaId: string, data: UpdateIdeaRequest, actor: string): Promise<PipelineIdea | null> {
  const existing = await getIdeaById(ideaId);
  if (!existing) return null;

  const sets: string[] = [];
  const params: any[] = [];
  const set = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`); };

  if (data.companyName !== undefined) set('company_name', data.companyName);
  if (data.why !== undefined) set('why_interesting', data.why?.trim() || 'No reason noted yet');
  if (data.owner !== undefined) set('assigned_to', data.owner);
  if (data.priority !== undefined) set('priority', data.priority);
  if (data.tag !== undefined) set('tag', data.tag || null);
  if (data.alert !== undefined) {
    const a = data.alert;
    set('alert_type', a ? a.type : null);
    set('alert_price', a?.type === 'price' ? a.value : null);
    set('alert_event', a?.type === 'event' ? a.text : null);
    set('alert_due', a?.type === 'event' ? (a.dueDate || null) : null);
  }
  const stageChanged = data.stage !== undefined && data.stage !== existing.stage;
  if (stageChanged) {
    set('stage', data.stage);
    sets.push('status_changed_date = CURRENT_DATE');
    if (data.stage === 'closed') {
      sets.push('closed_price = current_price');
    } else {
      set('outcome', null);
      set('closed_price', null);
    }
  }
  if (sets.length === 0) return existing;

  sets.push('updated_at = NOW()', 'last_activity_at = NOW()');
  params.push(ideaId);
  const rows = await query(
    `UPDATE pipeline_ideas SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (stageChanged) await logActivity(ideaId, 'stage', `Moved to ${STAGE_LABEL[data.stage!]}`, actor);
  return rows.length > 0 ? toIdea(rows[0]) : null;
}

/** Bought / Pass: close the idea, clear its alert and log the reason. */
export async function decideIdea(ideaId: string, outcome: PipelineOutcome, reason: string, actor: string): Promise<PipelineIdea | null> {
  await ensurePipelineSchema();
  const rows = await query(`
    UPDATE pipeline_ideas
    SET stage = 'closed', outcome = $1, closed_price = current_price,
        alert_type = NULL, alert_price = NULL, alert_event = NULL, alert_due = NULL,
        status_changed_date = CURRENT_DATE, updated_at = NOW(), last_activity_at = NOW()
    WHERE id = $2
    RETURNING *
  `, [outcome, ideaId]);
  if (rows.length === 0) return null;
  const label = outcome === 'bought' ? 'Bought' : 'Passed';
  await logActivity(ideaId, 'decision', reason.trim() ? `${label}: ${reason.trim()}` : label, actor);
  return toIdea(rows[0]);
}

export async function deleteIdea(ideaId: string): Promise<boolean> {
  const rows = await query(`DELETE FROM pipeline_ideas WHERE id = $1 RETURNING id`, [ideaId]);
  return rows.length > 0;
}

// ============ Activity (notes + system entries) ============

export async function getNotesByIdea(ideaId: string): Promise<PipelineNote[]> {
  await ensurePipelineSchema();
  const rows = await query(`
    SELECT * FROM pipeline_notes WHERE idea_id = $1 ORDER BY created_at DESC
  `, [ideaId]);
  return rows.map(toNote);
}

async function logActivity(
  ideaId: string,
  kind: PipelineActivityKind,
  text: string,
  addedBy: string,
  attachmentIds: string[] = [],
): Promise<PipelineNote> {
  const rows = await query(`
    INSERT INTO pipeline_notes (idea_id, note_text, added_by, kind, attachment_ids)
    VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *
  `, [ideaId, text, addedBy, kind, JSON.stringify(attachmentIds)]);
  return toNote(rows[0]);
}

export async function createNote(ideaId: string, noteText: string, addedBy: string, attachmentIds: string[] = []): Promise<PipelineNote> {
  await ensurePipelineSchema();
  const note = await logActivity(ideaId, 'note', noteText, addedBy, attachmentIds);
  await query(`UPDATE pipeline_ideas SET last_activity_at = NOW() WHERE id = $1`, [ideaId]);
  return note;
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
