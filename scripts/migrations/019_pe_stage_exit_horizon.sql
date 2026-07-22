-- Factsheet support: capture funding stage and expected exit horizon per PE company.
-- `stage` powers the private-book by-stage breakdown (Early / Growth / Late) on the
-- monthly factsheet. `exit_horizon` powers the liquidity profile — private holdings
-- are classified as illiquid with an expected exit under vs over 3 years.

ALTER TABLE pe_companies
  ADD COLUMN IF NOT EXISTS stage TEXT,
  ADD COLUMN IF NOT EXISTS exit_horizon TEXT;
