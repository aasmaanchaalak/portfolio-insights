-- Migration 010: Team members table (used for assignments + pipeline)

CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed from existing hardcoded list
INSERT INTO team_members (name) VALUES
  ('Deepak'), ('Aditya'), ('Tushar'), ('Aayush'), ('Daksh'), ('Siddhartha')
ON CONFLICT (name) DO NOTHING;
