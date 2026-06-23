-- Migration 017: People lists for the Bulk/Block deals filter.
-- Global (shared across all users), like stock_remarks / stock_assignments.
-- list_type 'include' = people to surface; 'exclude' = people to hide.

CREATE TABLE IF NOT EXISTS bulk_deal_people (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_type   VARCHAR(10) NOT NULL CHECK (list_type IN ('include', 'exclude')),
  client_name VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (list_type, client_name)
);

CREATE INDEX IF NOT EXISTS idx_bulk_deal_people_type ON bulk_deal_people(list_type);
