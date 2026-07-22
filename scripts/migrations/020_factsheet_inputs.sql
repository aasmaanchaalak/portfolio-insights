-- Manual inputs for the monthly factsheet that have no other source in the app:
-- cash position, the portfolio manager's note, and the F&O (derivatives) overlay
-- entered position-by-position. One row per reporting month ('YYYY-MM').

CREATE TABLE IF NOT EXISTS factsheet_inputs (
  month          TEXT PRIMARY KEY,               -- 'YYYY-MM'
  cash_position  DECIMAL(18, 2),                 -- ₹
  pm_note        TEXT,
  fno_positions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
