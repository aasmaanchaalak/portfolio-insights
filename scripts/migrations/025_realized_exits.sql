-- Migration 025: Realized exits
-- When a holding is fully sold it disappears from the GridKey snapshot; the upload
-- handler snapshots the realized P&L inputs here so sold positions still contribute
-- to period (FY-to-date) returns. Exit price = last-known market price at detection.
-- (Also created lazily at runtime by ensureRealizedExitsTable in lib/queries.ts.)

CREATE TABLE IF NOT EXISTS realized_exits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker         VARCHAR(30) NOT NULL,
  company_name   VARCHAR(255),
  quantity       DECIMAL(18,4),
  avg_buy_price  DECIMAL(14,4),
  exit_price     DECIMAL(14,4),
  exit_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_date     DATE,
  entry_price    DECIMAL(14,4),
  fy_start_price DECIMAL(14,4),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
