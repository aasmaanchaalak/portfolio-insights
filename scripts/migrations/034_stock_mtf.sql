-- Per-stock MTF (Margin Trading Facility) flag. A row means the holding is
-- "with MTF"; no row means "without MTF". Also auto-created by lib/queries.ts.

CREATE TABLE IF NOT EXISTS stock_mtf (
  stock_code VARCHAR(50) PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
