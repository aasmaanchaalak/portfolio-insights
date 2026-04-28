// PostgreSQL queries for portfolio data (replacing Redis)

import { query, queryOne } from './db';

// ============ Users ============

export type UserRole = 'portfolio' | 'analyst';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const row = await queryOne<any>(`
    SELECT id, email, password_hash, name, role, created_at, last_login_at
    FROM users WHERE email = $1
  `, [email]);

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role || 'analyst',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function createUser(email: string, passwordHash: string, name?: string, role: UserRole = 'analyst'): Promise<User> {
  const rows = await query<any>(`
    INSERT INTO users (email, password_hash, name, role)
    VALUES ($1, $2, $3, $4)
    RETURNING id, email, password_hash, name, role, created_at, last_login_at
  `, [email, passwordHash, name || null, role]);

  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role || 'analyst',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function updateUserLastLogin(email: string): Promise<void> {
  await query(`
    UPDATE users SET last_login_at = NOW() WHERE email = $1
  `, [email]);
}

export async function updateUserPassword(email: string, passwordHash: string): Promise<void> {
  await query(`
    UPDATE users SET password_hash = $1 WHERE email = $2
  `, [passwordHash, email]);
}

// ============ Admin Functions ============

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export async function getAllUsers(): Promise<UserSummary[]> {
  const rows = await query<any>(`
    SELECT id, email, name, role, created_at, last_login_at
    FROM users
    ORDER BY created_at DESC
  `);

  return rows.map(row => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role || 'analyst',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }));
}

export async function updateUserRole(email: string, role: UserRole): Promise<void> {
  await query(`
    UPDATE users SET role = $1 WHERE email = $2
  `, [role, email]);
}

export async function deleteUser(email: string): Promise<void> {
  await query(`DELETE FROM users WHERE email = $1`, [email]);
}

// ============ Allowed Emails ============

export interface AllowedEmail {
  id: string;
  email: string;
  addedBy: string | null;
  createdAt: string;
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  const row = await queryOne<any>(`
    SELECT id FROM allowed_emails WHERE email = $1
  `, [email.toLowerCase().trim()]);
  return !!row;
}

export async function getAllowedEmails(): Promise<AllowedEmail[]> {
  const rows = await query<any>(`
    SELECT id, email, added_by, created_at
    FROM allowed_emails
    ORDER BY created_at DESC
  `);

  return rows.map(row => ({
    id: row.id,
    email: row.email,
    addedBy: row.added_by,
    createdAt: row.created_at,
  }));
}

export async function addAllowedEmail(email: string, addedBy: string): Promise<AllowedEmail> {
  const rows = await query<any>(`
    INSERT INTO allowed_emails (email, added_by)
    VALUES ($1, $2)
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email, added_by, created_at
  `, [email.toLowerCase().trim(), addedBy]);

  if (rows.length === 0) {
    throw new Error('Email already in allowlist');
  }

  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    addedBy: row.added_by,
    createdAt: row.created_at,
  };
}

export async function removeAllowedEmail(email: string): Promise<boolean> {
  const result = await query(`
    DELETE FROM allowed_emails WHERE email = $1
  `, [email.toLowerCase().trim()]);
  return (result as any).rowCount > 0;
}

// ============ Sessions ============

export interface Session {
  id: string;
  sessionId: string;
  userEmail: string;
  createdAt: string;
  expiresAt: string;
}

export async function createSession(sessionId: string, userEmail: string, expiresAt: Date): Promise<Session> {
  const rows = await query<any>(`
    INSERT INTO sessions (session_id, user_email, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, session_id, user_email, created_at, expires_at
  `, [sessionId, userEmail, expiresAt.toISOString()]);

  const row = rows[0];
  return {
    id: row.id,
    sessionId: row.session_id,
    userEmail: row.user_email,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const row = await queryOne<any>(`
    SELECT id, session_id, user_email, created_at, expires_at
    FROM sessions
    WHERE session_id = $1 AND expires_at > NOW()
  `, [sessionId]);

  if (!row) return null;

  return {
    id: row.id,
    sessionId: row.session_id,
    userEmail: row.user_email,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await query(`DELETE FROM sessions WHERE session_id = $1`, [sessionId]);
}

export async function deleteUserSessions(userEmail: string): Promise<void> {
  await query(`DELETE FROM sessions WHERE user_email = $1`, [userEmail]);
}

// ============ Portfolio Data ============

export async function getPortfolioData(): Promise<any[] | null> {
  const row = await queryOne<any>(`
    SELECT data FROM portfolio_data ORDER BY updated_at DESC LIMIT 1
  `);
  return row?.data || null;
}

export async function savePortfolioData(data: any[]): Promise<void> {
  await query(`
    INSERT INTO portfolio_data (id, data)
    VALUES (gen_random_uuid(), $1)
    ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()
  `, [JSON.stringify(data)]);

  // Keep only the latest record
  await query(`
    DELETE FROM portfolio_data
    WHERE id NOT IN (SELECT id FROM portfolio_data ORDER BY updated_at DESC LIMIT 1)
  `);
}

// ============ GridKey Data ============

export async function getGridKeyData(): Promise<any[] | null> {
  const row = await queryOne<any>(`
    SELECT data FROM gridkey_data ORDER BY updated_at DESC LIMIT 1
  `);
  return row?.data || null;
}

export async function saveGridKeyData(data: any[]): Promise<void> {
  await query(`
    INSERT INTO gridkey_data (id, data)
    VALUES (gen_random_uuid(), $1)
    ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()
  `, [JSON.stringify(data)]);

  // Keep only the latest record
  await query(`
    DELETE FROM gridkey_data
    WHERE id NOT IN (SELECT id FROM gridkey_data ORDER BY updated_at DESC LIMIT 1)
  `);
}

// ============ Private Investments ============

export async function getPrivateInvestments(): Promise<{ totalInvested: number; count: number }> {
  const row = await queryOne<any>(`
    SELECT total_invested, count FROM private_investments LIMIT 1
  `);
  return {
    totalInvested: row?.total_invested ? Number(row.total_invested) : 0,
    count: row?.count || 0,
  };
}

export async function savePrivateInvestments(totalInvested: number, count: number): Promise<void> {
  const existing = await queryOne(`SELECT id FROM private_investments LIMIT 1`);

  if (existing) {
    await query(`
      UPDATE private_investments
      SET total_invested = $1, count = $2, updated_at = NOW()
    `, [totalInvested, count]);
  } else {
    await query(`
      INSERT INTO private_investments (total_invested, count)
      VALUES ($1, $2)
    `, [totalInvested, count]);
  }
}

// ============ Portfolio History ============

export async function getPortfolioHistory(): Promise<{ date: string; value: number; timestamp: number }[]> {
  const rows = await query<any>(`
    SELECT date, value, EXTRACT(EPOCH FROM recorded_at) * 1000 as timestamp
    FROM portfolio_history
    ORDER BY date ASC
  `);

  return rows.map(row => ({
    date: row.date.toISOString().split('T')[0],
    value: Number(row.value),
    timestamp: Number(row.timestamp),
  }));
}

export async function savePortfolioHistoryEntry(date: string, value: number): Promise<void> {
  await query(`
    INSERT INTO portfolio_history (date, value)
    VALUES ($1, $2)
    ON CONFLICT (date) DO UPDATE SET value = $2, recorded_at = NOW()
  `, [date, value]);
}

// ============ Stock Remarks ============

export async function getAllRemarks(): Promise<Record<string, string>> {
  const rows = await query<any>(`SELECT stock_code, remarks FROM stock_remarks WHERE remarks IS NOT NULL`);
  const result: Record<string, string> = {};
  rows.forEach(row => { result[row.stock_code] = row.remarks; });
  return result;
}

export async function setRemark(stockCode: string, remarks: string | null): Promise<void> {
  if (remarks) {
    await query(`
      INSERT INTO stock_remarks (stock_code, remarks)
      VALUES ($1, $2)
      ON CONFLICT (stock_code) DO UPDATE SET remarks = $2, updated_at = NOW()
    `, [stockCode, remarks]);
  } else {
    await query(`DELETE FROM stock_remarks WHERE stock_code = $1`, [stockCode]);
  }
}

// ============ Stock Assignments ============

export async function getAllAssignments(): Promise<Record<string, string>> {
  const rows = await query<any>(`SELECT stock_code, assigned_to FROM stock_assignments WHERE assigned_to IS NOT NULL`);
  const result: Record<string, string> = {};
  rows.forEach(row => { result[row.stock_code] = row.assigned_to; });
  return result;
}

export async function setAssignment(stockCode: string, assignedTo: string | null): Promise<void> {
  if (assignedTo) {
    await query(`
      INSERT INTO stock_assignments (stock_code, assigned_to)
      VALUES ($1, $2)
      ON CONFLICT (stock_code) DO UPDATE SET assigned_to = $2, updated_at = NOW()
    `, [stockCode, assignedTo]);
  } else {
    await query(`DELETE FROM stock_assignments WHERE stock_code = $1`, [stockCode]);
  }
}

// ============ Stock Buckets ============

export async function getAllBuckets(): Promise<Record<string, string>> {
  const rows = await query<any>(`SELECT stock_code, bucket FROM stock_buckets WHERE bucket IS NOT NULL`);
  const result: Record<string, string> = {};
  rows.forEach(row => { result[row.stock_code] = row.bucket; });
  return result;
}

export async function setBucket(stockCode: string, bucket: string | null): Promise<void> {
  if (bucket) {
    await query(`
      INSERT INTO stock_buckets (stock_code, bucket)
      VALUES ($1, $2)
      ON CONFLICT (stock_code) DO UPDATE SET bucket = $2, updated_at = NOW()
    `, [stockCode, bucket]);
  } else {
    await query(`DELETE FROM stock_buckets WHERE stock_code = $1`, [stockCode]);
  }
}

// ============ Stock Positioning ============

export interface StockPositioning {
  conviction: string;
  strategyType: string;
  actionIntent: string;
  timeHorizon?: string;
}

export async function getAllPositioning(): Promise<Record<string, StockPositioning>> {
  const rows = await query<any>(`
    SELECT stock_code, conviction, strategy_type, action_intent, time_horizon
    FROM stock_positioning
  `);

  const result: Record<string, StockPositioning> = {};
  rows.forEach(row => {
    result[row.stock_code] = {
      conviction: row.conviction,
      strategyType: row.strategy_type,
      actionIntent: row.action_intent,
      timeHorizon: row.time_horizon || undefined,
    };
  });
  return result;
}

export async function setPositioning(stockCode: string, positioning: StockPositioning): Promise<void> {
  await query(`
    INSERT INTO stock_positioning (stock_code, conviction, strategy_type, action_intent, time_horizon)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (stock_code) DO UPDATE SET
      conviction = $2,
      strategy_type = $3,
      action_intent = $4,
      time_horizon = $5,
      updated_at = NOW()
  `, [stockCode, positioning.conviction, positioning.strategyType, positioning.actionIntent, positioning.timeHorizon || null]);
}

export async function deletePositioning(stockCode: string): Promise<void> {
  await query(`DELETE FROM stock_positioning WHERE stock_code = $1`, [stockCode]);
}

// ============ Stock Entry Data ============

export interface StockEntryData {
  entryDate: string | null;
  entryPrice: number | null;
}

export async function getAllEntryData(): Promise<Record<string, StockEntryData>> {
  const rows = await query<any>(`SELECT stock_code, entry_date, entry_price FROM stock_entry_data`);

  const result: Record<string, StockEntryData> = {};
  rows.forEach(row => {
    result[row.stock_code] = {
      entryDate: row.entry_date ? row.entry_date.toISOString().split('T')[0] : null,
      entryPrice: row.entry_price ? Number(row.entry_price) : null,
    };
  });
  return result;
}

export async function setEntryData(stockCode: string, entryDate: string | null, entryPrice: number | null): Promise<void> {
  await query(`
    INSERT INTO stock_entry_data (stock_code, entry_date, entry_price)
    VALUES ($1, $2, $3)
    ON CONFLICT (stock_code) DO UPDATE SET
      entry_date = $2,
      entry_price = $3,
      updated_at = NOW()
  `, [stockCode, entryDate, entryPrice]);
}

export async function bulkSetEntryData(entries: { stockCode: string; entryDate: string | null; entryPrice: number | null }[]): Promise<void> {
  for (const entry of entries) {
    await setEntryData(entry.stockCode, entry.entryDate, entry.entryPrice);
  }
}

// ============ Technical States ============

export interface TechnicalState {
  stockCode: string;
  stockName: string;
  above50DMA: boolean;
  above200DMA: boolean;
  dma50Above200: boolean;
  near52WeekHigh: boolean;
  near52WeekLow: boolean;
  profitGrowthAbove15: boolean;
  salesGrowthAbove15: boolean;
  timestamp: string;
}

export async function getTechnicalStates(): Promise<TechnicalState[]> {
  const rows = await query<any>(`
    SELECT stock_code, stock_name, above_50dma, above_200dma, dma50_above_200,
           near_52week_high, near_52week_low, profit_growth_above_15, sales_growth_above_15, recorded_at
    FROM technical_states
  `);

  return rows.map(row => ({
    stockCode: row.stock_code,
    stockName: row.stock_name,
    above50DMA: row.above_50dma,
    above200DMA: row.above_200dma,
    dma50Above200: row.dma50_above_200,
    near52WeekHigh: row.near_52week_high,
    near52WeekLow: row.near_52week_low,
    profitGrowthAbove15: row.profit_growth_above_15,
    salesGrowthAbove15: row.sales_growth_above_15,
    timestamp: row.recorded_at?.toISOString() || new Date().toISOString(),
  }));
}

export async function saveTechnicalStates(states: TechnicalState[]): Promise<void> {
  // Clear existing states and insert new ones
  await query(`DELETE FROM technical_states`);

  for (const state of states) {
    await query(`
      INSERT INTO technical_states (
        stock_code, stock_name, above_50dma, above_200dma, dma50_above_200,
        near_52week_high, near_52week_low, profit_growth_above_15, sales_growth_above_15
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      state.stockCode,
      state.stockName,
      state.above50DMA,
      state.above200DMA,
      state.dma50Above200,
      state.near52WeekHigh,
      state.near52WeekLow,
      state.profitGrowthAbove15,
      state.salesGrowthAbove15,
    ]);
  }
}

// ============ Dashboard Alerts ============

export interface DashboardAlert {
  id: string;
  stockCode: string;
  stockName: string;
  alertType: string;
  message: string;
  currentPrice: number;
  thresholdValue: number;
  changePercent: number;
  triggeredAt: string;
  isRead: boolean;
  createdAt: string;
}

export async function getAlerts(): Promise<DashboardAlert[]> {
  const rows = await query<any>(`
    SELECT id, stock_code, stock_name, alert_type, message, current_price,
           threshold_value, change_percent, triggered_at, is_read, created_at
    FROM dashboard_alerts
    WHERE created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
  `);

  return rows.map(row => ({
    id: row.id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    alertType: row.alert_type,
    message: row.message,
    currentPrice: Number(row.current_price),
    thresholdValue: Number(row.threshold_value),
    changePercent: Number(row.change_percent),
    triggeredAt: row.triggered_at?.toISOString() || '',
    isRead: row.is_read,
    createdAt: row.created_at?.toISOString() || '',
  }));
}

export async function saveAlerts(alerts: Omit<DashboardAlert, 'id' | 'createdAt'>[]): Promise<void> {
  for (const alert of alerts) {
    // Check if alert already exists (by stockCode + alertType + triggeredAt)
    const existing = await queryOne(`
      SELECT id FROM dashboard_alerts
      WHERE stock_code = $1 AND alert_type = $2 AND triggered_at = $3
    `, [alert.stockCode, alert.alertType, alert.triggeredAt]);

    if (!existing) {
      await query(`
        INSERT INTO dashboard_alerts (
          stock_code, stock_name, alert_type, message, current_price,
          threshold_value, change_percent, triggered_at, is_read
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        alert.stockCode,
        alert.stockName,
        alert.alertType,
        alert.message,
        alert.currentPrice,
        alert.thresholdValue,
        alert.changePercent,
        alert.triggeredAt,
        alert.isRead,
      ]);
    }
  }
}

export async function markAlertRead(alertId: string): Promise<void> {
  await query(`UPDATE dashboard_alerts SET is_read = TRUE WHERE id = $1`, [alertId]);
}

// ============ Cache ============

export async function getCache<T>(key: string): Promise<T | null> {
  const row = await queryOne<any>(`
    SELECT value FROM cache
    WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())
  `, [key]);

  return row?.value || null;
}

export async function setCache(key: string, value: any, ttlSeconds?: number): Promise<void> {
  const expiresAt = ttlSeconds
    ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
    : null;

  await query(`
    INSERT INTO cache (key, value, expires_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (key) DO UPDATE SET
      value = $2,
      expires_at = $3,
      created_at = NOW()
  `, [key, JSON.stringify(value), expiresAt]);
}

export async function deleteCache(key: string): Promise<void> {
  await query(`DELETE FROM cache WHERE key = $1`, [key]);
}

// ============ Team Members ============

async function ensureTeamMembersTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

export async function getTeamMembers(): Promise<{ id: string; name: string }[]> {
  await ensureTeamMembersTable();
  const rows = await query<any>(`SELECT id, name FROM team_members ORDER BY name ASC`);
  return rows.map(r => ({ id: r.id, name: r.name }));
}

export async function addTeamMember(name: string): Promise<{ id: string; name: string }> {
  await ensureTeamMembersTable();
  const rows = await query<any>(
    `INSERT INTO team_members (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name`,
    [name.trim()]
  );
  return { id: rows[0].id, name: rows[0].name };
}

export async function deleteTeamMember(id: string): Promise<boolean> {
  const rows = await query<any>(`DELETE FROM team_members WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

// ============ Analyst Company Visibility ============
//
// Analysts cannot see companies whose invested amount is below the threshold
// unless an admin has flipped visibility for that specific company. The
// override table stores the explicit overrides; absence falls back to the
// default rule.

export const ANALYST_VISIBILITY_THRESHOLD = 2_000_000; // 20 lakhs

export async function getAnalystOverrides(): Promise<Record<string, boolean>> {
  const rows = await query<{ code: string; visible: boolean }>(
    `SELECT code, visible FROM analyst_company_overrides`
  );
  const map: Record<string, boolean> = {};
  for (const r of rows) map[r.code] = r.visible;
  return map;
}

export async function setAnalystOverride(code: string, visible: boolean): Promise<void> {
  await query(
    `INSERT INTO analyst_company_overrides (code, visible)
     VALUES ($1, $2)
     ON CONFLICT (code) DO UPDATE SET visible = EXCLUDED.visible, updated_at = NOW()`,
    [code, visible]
  );
}

export async function clearAnalystOverride(code: string): Promise<void> {
  await query(`DELETE FROM analyst_company_overrides WHERE code = $1`, [code]);
}

export function isVisibleToAnalyst(
  investedAmount: number,
  code: string | null,
  overrides: Record<string, boolean>
): boolean {
  if (code && code in overrides) return overrides[code];
  return investedAmount >= ANALYST_VISIBILITY_THRESHOLD;
}
