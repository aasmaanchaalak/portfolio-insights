-- Migration: 005_allowed_emails.sql
-- Create allowed_emails table for admin-managed registration allowlist

CREATE TABLE IF NOT EXISTS allowed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  added_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_allowed_emails_email ON allowed_emails(email);

-- Insert any existing users' emails as allowed (so they could re-register if needed)
INSERT INTO allowed_emails (email, added_by)
SELECT DISTINCT email, 'migration'
FROM users
ON CONFLICT (email) DO NOTHING;
