-- Migration 008: Investment Pipeline tables

CREATE TABLE IF NOT EXISTS price_cache (
  ticker VARCHAR(20) PRIMARY KEY,
  close_price DECIMAL(12,2),
  price_date DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(20) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  added_by VARCHAR(100) NOT NULL,
  assigned_to VARCHAR(100),
  source TEXT,
  why_interesting TEXT,
  price_at_add DECIMAL(12,2),
  current_price DECIMAL(12,2),
  status VARCHAR(20) NOT NULL DEFAULT 'captured'
    CHECK (status IN ('captured','triaged','studying','tracking','conviction','exited_watch','killed')),
  priority VARCHAR(10) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high','medium','low')),
  decision TEXT,
  decision_reason TEXT,
  trigger_condition TEXT,
  date_added DATE NOT NULL DEFAULT CURRENT_DATE,
  status_changed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_ideas_status ON pipeline_ideas(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_ideas_ticker ON pipeline_ideas(ticker);

CREATE TABLE IF NOT EXISTS pipeline_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  idea_id UUID NOT NULL REFERENCES pipeline_ideas(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  added_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_notes_idea_id ON pipeline_notes(idea_id);

CREATE TABLE IF NOT EXISTS guidance_tracker (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker VARCHAR(20) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  metric VARCHAR(50) NOT NULL,
  guided_value DECIMAL(15,2),
  guided_unit VARCHAR(10),
  current_value DECIMAL(15,2),
  timeframe VARCHAR(30),
  source_context TEXT,
  date_added DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guidance_tracker_ticker ON guidance_tracker(ticker);
