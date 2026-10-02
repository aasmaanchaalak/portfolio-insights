// F&O storage. One row per account per report date, plus trades (for
// charges), hand-set purposes, the margin/cash figures typed in, and the
// account's holdings (collateral and hedge cover).

import { query, queryOne } from '../db';
import { FoReport, ReportLeg, ReportTrade, Purpose, FoHolding } from './types';

let ready = false;
async function ensureTables(): Promise<void> {
  if (ready) return;
  await query(`
    CREATE TABLE IF NOT EXISTS fo_reports (
      account     VARCHAR(50) NOT NULL,
      as_of       DATE NOT NULL,
      legs        JSONB NOT NULL,
      spots       JSONB,
      uploaded_by VARCHAR(255),
      uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      PRIMARY KEY (account, as_of)
    );
    CREATE TABLE IF NOT EXISTS fo_trades (
      account   VARCHAR(50) NOT NULL,
      contract  VARCHAR(100) NOT NULL,
      txn_date  DATE NOT NULL,
      side      VARCHAR(4) NOT NULL,
      qty       NUMERIC NOT NULL,
      price     NUMERIC NOT NULL,
      charges   NUMERIC NOT NULL,
      PRIMARY KEY (account, contract, txn_date, side, qty, price)
    );
    CREATE TABLE IF NOT EXISTS fo_purposes (
      account    VARCHAR(50) NOT NULL,
      contract   VARCHAR(100) NOT NULL,
      purpose    VARCHAR(20) NOT NULL,
      updated_by VARCHAR(255),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      PRIMARY KEY (account, contract)
    );
    CREATE TABLE IF NOT EXISTS fo_margin (
      account    VARCHAR(50) PRIMARY KEY,
      span       NUMERIC,
      exposure   NUMERIC,
      total      NUMERIC,
      cash       NUMERIC,
      updated_by VARCHAR(255),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    -- pledged = Nuvama's "Margin from Pledged Holdings". span / exposure / total
    -- are no longer entered: margin is calculated from NSE's SPAN file.
    ALTER TABLE fo_margin ADD COLUMN IF NOT EXISTS pledged NUMERIC;
    CREATE TABLE IF NOT EXISTS fo_holdings (
      portfolio  VARCHAR(255) PRIMARY KEY,
      holdings   JSONB NOT NULL,
      updated_by VARCHAR(255),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  ready = true;
}

/** Spot per underlying at upload time: { SYMBOL: { price, time } }. */
export type SpotsAtUpload = Record<string, { price: number; time: number }>;

export async function saveReport(r: FoReport, spots: SpotsAtUpload, by: string): Promise<void> {
  await ensureTables();
  await query(`
    INSERT INTO fo_reports (account, as_of, legs, spots, uploaded_by, uploaded_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (account, as_of) DO UPDATE SET legs = $3, spots = $4, uploaded_by = $5, uploaded_at = NOW()
  `, [r.account, r.asOf, JSON.stringify(r.legs), JSON.stringify(spots), by]);
  for (const t of r.trades) {
    await query(`
      INSERT INTO fo_trades (account, contract, txn_date, side, qty, price, charges)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (account, contract, txn_date, side, qty, price) DO UPDATE SET charges = $7
    `, [r.account, t.contract, t.date, t.side, t.qty, t.price, t.charges]);
  }
}

export interface StoredReport { account: string; asOf: string; legs: ReportLeg[]; spots: SpotsAtUpload | null; uploadedAt: string }

/** Reports on or after `since` (YYYY-MM-DD), plus the last one before it as a baseline. */
export async function getReportsSince(since: string): Promise<StoredReport[]> {
  await ensureTables();
  const rows = await query<any>(`
    SELECT account, to_char(as_of, 'YYYY-MM-DD') as_of, legs, spots, uploaded_at FROM fo_reports r
    WHERE as_of >= $1
       OR as_of = (SELECT MAX(as_of) FROM fo_reports p WHERE p.account = r.account AND p.as_of < $1)
    ORDER BY as_of
  `, [since]);
  return rows.map(r => ({ account: r.account, asOf: r.as_of, legs: r.legs, spots: r.spots, uploadedAt: r.uploaded_at }));
}

export async function listReportDates(): Promise<{ account: string; asOf: string; legs: number; uploadedAt: string; uploadedBy: string | null }[]> {
  await ensureTables();
  const rows = await query<any>(`
    SELECT account, to_char(as_of, 'YYYY-MM-DD') as_of, jsonb_array_length(legs) n, uploaded_at, uploaded_by
    FROM fo_reports ORDER BY as_of DESC LIMIT 60
  `);
  return rows.map(r => ({ account: r.account, asOf: r.as_of, legs: Number(r.n), uploadedAt: r.uploaded_at, uploadedBy: r.uploaded_by }));
}

export async function getTradesBetween(from: string, to: string): Promise<(ReportTrade & { account: string })[]> {
  await ensureTables();
  const rows = await query<any>(`
    SELECT account, contract, to_char(txn_date, 'YYYY-MM-DD') d, side, qty, price, charges
    FROM fo_trades WHERE txn_date BETWEEN $1 AND $2
  `, [from, to]);
  return rows.map(r => ({ account: r.account, contract: r.contract, date: r.d, side: r.side, qty: Number(r.qty), price: Number(r.price), charges: Number(r.charges) }));
}

export async function getPurposes(): Promise<Record<string, Purpose>> {
  await ensureTables();
  const rows = await query<any>(`SELECT account, contract, purpose FROM fo_purposes`);
  return Object.fromEntries(rows.map(r => [`${r.account}|${r.contract}`, r.purpose]));
}

export async function setPurpose(account: string, contract: string, purpose: Purpose | null, by: string): Promise<void> {
  await ensureTables();
  if (!purpose) {
    await query(`DELETE FROM fo_purposes WHERE account = $1 AND contract = $2`, [account, contract]);
    return;
  }
  await query(`
    INSERT INTO fo_purposes (account, contract, purpose, updated_by, updated_at) VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (account, contract) DO UPDATE SET purpose = $3, updated_by = $4, updated_at = NOW()
  `, [account, contract, purpose, by]);
}

/** Figures copied from Nuvama's Margin screen. */
export interface MarginEntry {
  cash: number | null;     // Cash Available (negative = debit balance)
  pledged: number | null;  // Margin from Pledged Holdings (after Nuvama's haircuts)
  updatedAt: string;
  updatedBy: string | null;
}

export async function getMarginEntries(): Promise<Record<string, MarginEntry>> {
  await ensureTables();
  const rows = await query<any>(`SELECT * FROM fo_margin`);
  const n = (v: any) => (v == null ? null : Number(v));
  return Object.fromEntries(rows.map(r => [r.account, {
    cash: n(r.cash), pledged: n(r.pledged), updatedAt: r.updated_at, updatedBy: r.updated_by,
  }]));
}

export async function setMarginEntry(account: string, m: { cash: number | null; pledged: number | null }, by: string): Promise<void> {
  await ensureTables();
  await query(`
    INSERT INTO fo_margin (account, cash, pledged, updated_by, updated_at) VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (account) DO UPDATE SET cash = $2, pledged = $3, updated_by = $4, updated_at = NOW()
  `, [account, m.cash, m.pledged, by]);
}

/** A GridKey portfolio's holdings, saved by the GridKey upload. */
export async function getHoldings(portfolio: string): Promise<{ holdings: FoHolding[]; updatedAt: string } | null> {
  await ensureTables();
  const row = await queryOne<any>(`SELECT holdings, updated_at FROM fo_holdings WHERE portfolio = $1`, [portfolio]);
  return row ? { holdings: row.holdings, updatedAt: row.updated_at } : null;
}

export async function setHoldings(portfolio: string, holdings: FoHolding[], by: string): Promise<void> {
  await ensureTables();
  await query(`
    INSERT INTO fo_holdings (portfolio, holdings, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
    ON CONFLICT (portfolio) DO UPDATE SET holdings = $2, updated_by = $3, updated_at = NOW()
  `, [portfolio, JSON.stringify(holdings), by]);
}

export async function getAccounts(): Promise<string[]> {
  await ensureTables();
  const rows = await query<any>(`SELECT DISTINCT account FROM fo_reports ORDER BY account`);
  return rows.map(r => r.account);
}

export async function hasAnyReport(): Promise<boolean> {
  await ensureTables();
  return !!(await queryOne(`SELECT 1 FROM fo_reports LIMIT 1`));
}
