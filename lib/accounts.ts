// Account splits. Combined PF exports have one row per account ("Portfolio"
// column). The main holdings sum those rows per stock; here we keep each
// account's own rows so the Portfolio page can show a single account or a
// family office (a group of accounts, e.g. our own and a friend's).

import { query, queryOne } from './db';

export interface AccountHolding {
  portfolio: string;
  name: string;
  nseCode: string | null;
  bseCode: string | null;
  quantity: number;
  averageBuyPrice: number | null;
}

export interface AccountMeta {
  portfolio: string;        // account name exactly as in the PF export
  label: string | null;     // friendly display name ('' / null = use portfolio)
  familyOffice: string | null;
}

let ready = false;
async function ensureTables(): Promise<void> {
  if (ready) return;
  await query(`
    CREATE TABLE IF NOT EXISTS pf_account_holdings (
      id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      holdings   JSONB NOT NULL,
      updated_by VARCHAR(255),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS pf_accounts (
      portfolio     VARCHAR(255) PRIMARY KEY,
      label         VARCHAR(255),
      family_office VARCHAR(255),
      updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  ready = true;
}

/** Replace the per-account snapshot and register any new account names. */
export async function saveAccountHoldings(holdings: AccountHolding[], by: string): Promise<void> {
  await ensureTables();
  await query(`
    INSERT INTO pf_account_holdings (id, holdings, updated_by, updated_at) VALUES (1, $1, $2, NOW())
    ON CONFLICT (id) DO UPDATE SET holdings = $1, updated_by = $2, updated_at = NOW()
  `, [JSON.stringify(holdings), by]);
  const names = [...new Set(holdings.map(h => h.portfolio))];
  if (names.length) {
    await query(
      `INSERT INTO pf_accounts (portfolio) SELECT UNNEST($1::text[]) ON CONFLICT (portfolio) DO NOTHING`,
      [names]
    );
  }
}

export async function getAccountHoldings(): Promise<{ holdings: AccountHolding[]; updatedAt: string } | null> {
  await ensureTables();
  const row = await queryOne<any>(`SELECT holdings, updated_at FROM pf_account_holdings WHERE id = 1`);
  return row ? { holdings: row.holdings, updatedAt: row.updated_at } : null;
}

export async function getAccountsMeta(): Promise<AccountMeta[]> {
  await ensureTables();
  const rows = await query<any>(`SELECT portfolio, label, family_office FROM pf_accounts ORDER BY family_office NULLS LAST, portfolio`);
  return rows.map(r => ({ portfolio: r.portfolio, label: r.label || null, familyOffice: r.family_office || null }));
}

export async function setAccountMeta(portfolio: string, label: string | null, familyOffice: string | null): Promise<void> {
  await ensureTables();
  await query(`
    INSERT INTO pf_accounts (portfolio, label, family_office, updated_at) VALUES ($1, $2, $3, NOW())
    ON CONFLICT (portfolio) DO UPDATE SET label = $2, family_office = $3, updated_at = NOW()
  `, [portfolio, label, familyOffice]);
}
