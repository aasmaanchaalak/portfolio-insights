// User-set price alerts: notify once when a holding reaches a target price.
// The direction is fixed when the alert is created — a target above the price
// at that moment fires on a rise to it, one below fires on a fall to it.

import { query, queryOne } from './db';

export type PriceAlertDirection = 'above' | 'below';

export interface PriceAlert {
  id: number;
  stockCode: string;
  targetPrice: number;
  direction: PriceAlertDirection;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  triggeredAt: string | null;
  triggeredPrice: number | null;
}

let tableReady = false;
async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id              SERIAL PRIMARY KEY,
      stock_code      VARCHAR(50) NOT NULL,
      target_price    NUMERIC NOT NULL,
      direction       VARCHAR(5) NOT NULL CHECK (direction IN ('above', 'below')),
      note            TEXT,
      created_by      VARCHAR(255),
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      triggered_at    TIMESTAMP WITH TIME ZONE,
      triggered_price NUMERIC
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS price_alerts_code_idx ON price_alerts (stock_code)`);
  tableReady = true;
}

function toAlert(r: any): PriceAlert {
  return {
    id: r.id,
    stockCode: r.stock_code,
    targetPrice: Number(r.target_price),
    direction: r.direction,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
    triggeredAt: r.triggered_at,
    triggeredPrice: r.triggered_price != null ? Number(r.triggered_price) : null,
  };
}

/** Alerts for one stock (newest first), or every alert when no code is given. */
export async function getPriceAlerts(stockCode?: string): Promise<PriceAlert[]> {
  await ensureTable();
  const rows = stockCode
    ? await query<any>(`SELECT * FROM price_alerts WHERE UPPER(stock_code) = UPPER($1) ORDER BY created_at DESC`, [stockCode])
    : await query<any>(`SELECT * FROM price_alerts ORDER BY created_at DESC`);
  return rows.map(toAlert);
}

export async function getActivePriceAlerts(): Promise<PriceAlert[]> {
  await ensureTable();
  return (await query<any>(`SELECT * FROM price_alerts WHERE triggered_at IS NULL`)).map(toAlert);
}

export async function createPriceAlert(
  stockCode: string,
  targetPrice: number,
  direction: PriceAlertDirection,
  note: string | null,
  createdBy: string | null,
): Promise<PriceAlert> {
  await ensureTable();
  const row = await queryOne<any>(`
    INSERT INTO price_alerts (stock_code, target_price, direction, note, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [stockCode, targetPrice, direction, note, createdBy]);
  return toAlert(row);
}

export async function deletePriceAlert(id: number): Promise<void> {
  await ensureTable();
  await query(`DELETE FROM price_alerts WHERE id = $1`, [id]);
}

export async function markPriceAlertTriggered(id: number, price: number): Promise<void> {
  await query(`UPDATE price_alerts SET triggered_at = NOW(), triggered_price = $2 WHERE id = $1`, [id, price]);
}

/** True once the price has reached the target in the alert's direction. */
export function priceAlertHit(a: Pick<PriceAlert, 'targetPrice' | 'direction'>, price: number): boolean {
  return a.direction === 'above' ? price >= a.targetPrice : price <= a.targetPrice;
}
