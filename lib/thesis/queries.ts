import { PoolClient } from 'pg';
import { query, queryOne, transaction } from '../db';
import {
  Thesis,
  ThesisKPI,
  ThesisBreakCondition,
  ThesisSignal,
  ThesisHistoryEntry,
  ThesisStatus,
  CreateThesisRequest,
  UpdateThesisRequest,
} from '../../types/thesis';
import crypto from 'crypto';

// Helper to generate UUID
function generateUUID(): string {
  return crypto.randomUUID();
}

// Fetch thesis with all related data
export async function getThesisByStockCode(stockCode: string): Promise<Thesis | null> {
  const thesis = await queryOne<any>(
    `SELECT id, stock_code as "stockCode", stock_name as "stockName", status,
            original_thesis as "originalThesis", latest_note as "latestNote",
            last_review_date as "lastReviewDate", created_at as "createdAt",
            updated_at as "updatedAt", version
     FROM theses WHERE stock_code = $1`,
    [stockCode]
  );

  if (!thesis) return null;

  const [kpis, breakConditions, signals] = await Promise.all([
    query<ThesisKPI>(
      `SELECT id, thesis_id as "thesisId", description, target_value as "targetValue",
              current_status as "currentStatus", sort_order as "sortOrder", created_at as "createdAt"
       FROM thesis_kpis WHERE thesis_id = $1 ORDER BY sort_order`,
      [thesis.id]
    ),
    query<ThesisBreakCondition>(
      `SELECT id, thesis_id as "thesisId", condition, is_triggered as "isTriggered",
              triggered_at as "triggeredAt", sort_order as "sortOrder", created_at as "createdAt"
       FROM thesis_break_conditions WHERE thesis_id = $1 ORDER BY sort_order`,
      [thesis.id]
    ),
    query<ThesisSignal>(
      `SELECT id, thesis_id as "thesisId", signal_type as "signalType", title, description,
              sentiment, is_active as "isActive", created_at as "createdAt", expires_at as "expiresAt"
       FROM thesis_signals WHERE thesis_id = $1 AND is_active = true ORDER BY created_at DESC`,
      [thesis.id]
    ),
  ]);

  return {
    ...thesis,
    kpis,
    breakConditions,
    signals,
  };
}

// Fetch recent history entries
export async function getRecentHistory(
  thesisId: string,
  limit: number = 5
): Promise<ThesisHistoryEntry[]> {
  return query<ThesisHistoryEntry>(
    `SELECT id, thesis_id as "thesisId", action_type as "actionType",
            field_changed as "fieldChanged", old_value as "oldValue",
            new_value as "newValue", note, created_at as "createdAt",
            change_group_id as "changeGroupId"
     FROM thesis_history WHERE thesis_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [thesisId, limit]
  );
}

// Fetch paginated history
export async function getHistory(
  stockCode: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ history: ThesisHistoryEntry[]; total: number }> {
  const thesis = await queryOne<{ id: string }>(
    'SELECT id FROM theses WHERE stock_code = $1',
    [stockCode]
  );

  if (!thesis) {
    return { history: [], total: 0 };
  }

  const [history, countResult] = await Promise.all([
    query<ThesisHistoryEntry>(
      `SELECT id, thesis_id as "thesisId", action_type as "actionType",
              field_changed as "fieldChanged", old_value as "oldValue",
              new_value as "newValue", note, created_at as "createdAt",
              change_group_id as "changeGroupId"
       FROM thesis_history WHERE thesis_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [thesis.id, limit, offset]
    ),
    queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM thesis_history WHERE thesis_id = $1',
      [thesis.id]
    ),
  ]);

  return {
    history,
    total: parseInt(countResult?.count || '0', 10),
  };
}

// Create a new thesis
export async function createThesis(data: CreateThesisRequest): Promise<Thesis> {
  return transaction(async (client: PoolClient) => {
    const thesisId = generateUUID();
    const changeGroupId = generateUUID();

    // Insert main thesis
    await client.query(
      `INSERT INTO theses (id, stock_code, stock_name, status, original_thesis, latest_note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        thesisId,
        data.stockCode,
        data.stockName,
        data.status || 'intact',
        data.originalThesis || null,
        data.latestNote || null,
      ]
    );

    // Insert KPIs
    if (data.kpis && data.kpis.length > 0) {
      for (let i = 0; i < data.kpis.length; i++) {
        const kpi = data.kpis[i];
        await client.query(
          `INSERT INTO thesis_kpis (id, thesis_id, description, target_value, current_status, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [generateUUID(), thesisId, kpi.description, kpi.targetValue || null, kpi.currentStatus || 'on_track', i]
        );
      }
    }

    // Insert break conditions
    if (data.breakConditions && data.breakConditions.length > 0) {
      for (let i = 0; i < data.breakConditions.length; i++) {
        const bc = data.breakConditions[i];
        await client.query(
          `INSERT INTO thesis_break_conditions (id, thesis_id, condition, is_triggered, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [generateUUID(), thesisId, bc.condition, bc.isTriggered || false, i]
        );
      }
    }

    // Insert signals
    if (data.signals && data.signals.length > 0) {
      for (const signal of data.signals) {
        await client.query(
          `INSERT INTO thesis_signals (id, thesis_id, signal_type, title, description, sentiment, is_active, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            generateUUID(),
            thesisId,
            signal.signalType,
            signal.title,
            signal.description || null,
            signal.sentiment || 'neutral',
            signal.isActive !== false,
            signal.expiresAt || null,
          ]
        );
      }
    }

    // Record creation in history
    await client.query(
      `INSERT INTO thesis_history (id, thesis_id, action_type, new_value, change_group_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [generateUUID(), thesisId, 'thesis_created', JSON.stringify(data), changeGroupId]
    );

    // Fetch and return the complete thesis
    const result = await client.query(
      `SELECT id, stock_code as "stockCode", stock_name as "stockName", status,
              original_thesis as "originalThesis", latest_note as "latestNote",
              last_review_date as "lastReviewDate", created_at as "createdAt",
              updated_at as "updatedAt", version
       FROM theses WHERE id = $1`,
      [thesisId]
    );

    const thesis = result.rows[0];

    const [kpisResult, bcResult, signalsResult] = await Promise.all([
      client.query(
        `SELECT id, description, target_value as "targetValue", current_status as "currentStatus", sort_order as "sortOrder"
         FROM thesis_kpis WHERE thesis_id = $1 ORDER BY sort_order`,
        [thesisId]
      ),
      client.query(
        `SELECT id, condition, is_triggered as "isTriggered", triggered_at as "triggeredAt", sort_order as "sortOrder"
         FROM thesis_break_conditions WHERE thesis_id = $1 ORDER BY sort_order`,
        [thesisId]
      ),
      client.query(
        `SELECT id, signal_type as "signalType", title, description, sentiment, is_active as "isActive", expires_at as "expiresAt"
         FROM thesis_signals WHERE thesis_id = $1 AND is_active = true`,
        [thesisId]
      ),
    ]);

    return {
      ...thesis,
      kpis: kpisResult.rows,
      breakConditions: bcResult.rows,
      signals: signalsResult.rows,
    };
  });
}

// Update an existing thesis
export async function updateThesis(
  stockCode: string,
  data: UpdateThesisRequest
): Promise<Thesis | null> {
  return transaction(async (client: PoolClient) => {
    // Get current thesis
    const currentResult = await client.query(
      `SELECT id, stock_code as "stockCode", stock_name as "stockName", status,
              original_thesis as "originalThesis", latest_note as "latestNote",
              last_review_date as "lastReviewDate", version
       FROM theses WHERE stock_code = $1`,
      [stockCode]
    );

    if (currentResult.rows.length === 0) {
      return null;
    }

    const current = currentResult.rows[0];
    const thesisId = current.id;
    const changeGroupId = generateUUID();

    // Track changes for history
    const changes: { field: string; oldValue: any; newValue: any }[] = [];

    // Update main fields
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.status !== undefined && data.status !== current.status) {
      changes.push({ field: 'status', oldValue: current.status, newValue: data.status });
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (data.originalThesis !== undefined && data.originalThesis !== current.originalThesis) {
      changes.push({ field: 'originalThesis', oldValue: current.originalThesis, newValue: data.originalThesis });
      updates.push(`original_thesis = $${paramIndex++}`);
      values.push(data.originalThesis);
    }

    if (data.latestNote !== undefined && data.latestNote !== current.latestNote) {
      changes.push({ field: 'latestNote', oldValue: current.latestNote, newValue: data.latestNote });
      updates.push(`latest_note = $${paramIndex++}`);
      values.push(data.latestNote);
    }

    if (data.lastReviewDate !== undefined) {
      changes.push({ field: 'lastReviewDate', oldValue: current.lastReviewDate, newValue: data.lastReviewDate });
      updates.push(`last_review_date = $${paramIndex++}`);
      values.push(data.lastReviewDate);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      updates.push(`version = version + 1`);
      values.push(thesisId);

      await client.query(
        `UPDATE theses SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

    // Update KPIs if provided (replace all)
    if (data.kpis !== undefined) {
      // Get current KPIs for history
      const currentKpis = await client.query(
        'SELECT description, target_value, current_status FROM thesis_kpis WHERE thesis_id = $1',
        [thesisId]
      );
      changes.push({ field: 'kpis', oldValue: currentKpis.rows, newValue: data.kpis });

      await client.query('DELETE FROM thesis_kpis WHERE thesis_id = $1', [thesisId]);

      for (let i = 0; i < data.kpis.length; i++) {
        const kpi = data.kpis[i];
        await client.query(
          `INSERT INTO thesis_kpis (id, thesis_id, description, target_value, current_status, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [kpi.id || generateUUID(), thesisId, kpi.description, kpi.targetValue || null, kpi.currentStatus || 'on_track', i]
        );
      }
    }

    // Update break conditions if provided (replace all)
    if (data.breakConditions !== undefined) {
      const currentBc = await client.query(
        'SELECT condition, is_triggered FROM thesis_break_conditions WHERE thesis_id = $1',
        [thesisId]
      );
      changes.push({ field: 'breakConditions', oldValue: currentBc.rows, newValue: data.breakConditions });

      await client.query('DELETE FROM thesis_break_conditions WHERE thesis_id = $1', [thesisId]);

      for (let i = 0; i < data.breakConditions.length; i++) {
        const bc = data.breakConditions[i];
        await client.query(
          `INSERT INTO thesis_break_conditions (id, thesis_id, condition, is_triggered, triggered_at, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            bc.id || generateUUID(),
            thesisId,
            bc.condition,
            bc.isTriggered || false,
            bc.isTriggered ? (bc.triggeredAt || new Date().toISOString()) : null,
            i,
          ]
        );
      }
    }

    // Update signals if provided (replace active ones)
    if (data.signals !== undefined) {
      const currentSignals = await client.query(
        'SELECT signal_type, title, sentiment FROM thesis_signals WHERE thesis_id = $1 AND is_active = true',
        [thesisId]
      );
      changes.push({ field: 'signals', oldValue: currentSignals.rows, newValue: data.signals });

      // Mark existing as inactive
      await client.query(
        'UPDATE thesis_signals SET is_active = false WHERE thesis_id = $1',
        [thesisId]
      );

      for (const signal of data.signals) {
        await client.query(
          `INSERT INTO thesis_signals (id, thesis_id, signal_type, title, description, sentiment, is_active, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            signal.id || generateUUID(),
            thesisId,
            signal.signalType,
            signal.title,
            signal.description || null,
            signal.sentiment || 'neutral',
            signal.isActive !== false,
            signal.expiresAt || null,
          ]
        );
      }
    }

    // Record changes in history
    for (const change of changes) {
      const actionType = change.field === 'status' ? 'status_changed' :
                         change.field === 'latestNote' ? 'note_added' :
                         change.field === 'lastReviewDate' ? 'review_completed' : 'thesis_updated';

      await client.query(
        `INSERT INTO thesis_history (id, thesis_id, action_type, field_changed, old_value, new_value, note, change_group_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          generateUUID(),
          thesisId,
          actionType,
          change.field,
          typeof change.oldValue === 'object' ? JSON.stringify(change.oldValue) : change.oldValue,
          typeof change.newValue === 'object' ? JSON.stringify(change.newValue) : change.newValue,
          data.changeNote || null,
          changeGroupId,
        ]
      );
    }

    // Fetch and return updated thesis
    const updatedResult = await client.query(
      `SELECT id, stock_code as "stockCode", stock_name as "stockName", status,
              original_thesis as "originalThesis", latest_note as "latestNote",
              last_review_date as "lastReviewDate", created_at as "createdAt",
              updated_at as "updatedAt", version
       FROM theses WHERE id = $1`,
      [thesisId]
    );

    const thesis = updatedResult.rows[0];

    const [kpisResult, bcResult, signalsResult] = await Promise.all([
      client.query(
        `SELECT id, description, target_value as "targetValue", current_status as "currentStatus", sort_order as "sortOrder"
         FROM thesis_kpis WHERE thesis_id = $1 ORDER BY sort_order`,
        [thesisId]
      ),
      client.query(
        `SELECT id, condition, is_triggered as "isTriggered", triggered_at as "triggeredAt", sort_order as "sortOrder"
         FROM thesis_break_conditions WHERE thesis_id = $1 ORDER BY sort_order`,
        [thesisId]
      ),
      client.query(
        `SELECT id, signal_type as "signalType", title, description, sentiment, is_active as "isActive", expires_at as "expiresAt"
         FROM thesis_signals WHERE thesis_id = $1 AND is_active = true`,
        [thesisId]
      ),
    ]);

    return {
      ...thesis,
      kpis: kpisResult.rows,
      breakConditions: bcResult.rows,
      signals: signalsResult.rows,
    };
  });
}
