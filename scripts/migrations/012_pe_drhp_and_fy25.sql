-- Track DRHP filing and FY25 annual report receipt on PE companies.

ALTER TABLE pe_companies
  ADD COLUMN IF NOT EXISTS drhp_filed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS drhp_filed_date DATE,
  ADD COLUMN IF NOT EXISTS drhp_link TEXT,
  ADD COLUMN IF NOT EXISTS fy25_annual_report_received BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fy25_annual_report_date DATE;
