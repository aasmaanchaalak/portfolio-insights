-- Per-company override of analyst visibility. Default rule: analysts cannot
-- see companies whose invested amount is under 20 lakhs. Admin can flip
-- visibility for individual companies via this table.

CREATE TABLE IF NOT EXISTS analyst_company_overrides (
  code TEXT PRIMARY KEY,
  visible BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
