-- Account splits. pf_account_holdings keeps the latest PF upload's per-account
-- rows (one JSONB snapshot); pf_accounts gives each account a label and a
-- family office. Also auto-created by lib/accounts.ts.

CREATE TABLE IF NOT EXISTS pf_account_holdings (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  holdings   JSONB NOT NULL,
  updated_by VARCHAR(255),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pf_accounts (
  portfolio     VARCHAR(255) PRIMARY KEY,
  label         VARCHAR(255),
  family_office VARCHAR(255),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
