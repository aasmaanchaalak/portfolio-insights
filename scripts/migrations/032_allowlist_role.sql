-- Role a person gets when they register from the allowlist.
ALTER TABLE allowed_emails ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'analyst';
