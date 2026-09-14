-- Migration 024: Financial-year-start (1 April) reference prices
-- Stores a per-ticker price snapshot for the first day of the financial year,
-- used as the exact baseline for FY-to-date portfolio returns. Keyed by ticker
-- (NSE or BSE); any uploaded ticker is stored, even if not in the portfolio.
-- (Also created lazily at runtime by ensureFYStartPricesTable in lib/queries.ts.)

CREATE TABLE IF NOT EXISTS fy_start_prices (
  ticker     VARCHAR(30) PRIMARY KEY,
  price      DECIMAL(14,4) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
