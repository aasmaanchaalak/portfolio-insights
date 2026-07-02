-- Track exits (sold positions) on PE companies.
-- Exited companies keep their investment history; exit_value is the
-- realized proceeds used for realized MOIC instead of current_value.

ALTER TABLE pe_companies
  ADD COLUMN IF NOT EXISTS is_exited BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exit_date DATE,
  ADD COLUMN IF NOT EXISTS exit_value DECIMAL(18, 2);
