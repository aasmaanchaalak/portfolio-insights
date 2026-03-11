-- Migration: Create thesis tables for investment thesis tracking
-- Run this migration against your PostgreSQL database

-- Main thesis table (one per stock)
CREATE TABLE IF NOT EXISTS theses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_code VARCHAR(20) NOT NULL UNIQUE,
    stock_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'intact'
        CHECK (status IN ('intact', 'monitor', 'broken')),
    original_thesis TEXT,
    latest_note TEXT,
    last_review_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

-- KPIs to watch (one-to-many)
CREATE TABLE IF NOT EXISTS thesis_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    target_value VARCHAR(100),
    current_status VARCHAR(20) DEFAULT 'on_track'
        CHECK (current_status IN ('on_track', 'warning', 'breached')),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Break conditions (one-to-many)
CREATE TABLE IF NOT EXISTS thesis_break_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
    condition TEXT NOT NULL,
    is_triggered BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMP WITH TIME ZONE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Current signals
CREATE TABLE IF NOT EXISTS thesis_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
    signal_type VARCHAR(20) NOT NULL
        CHECK (signal_type IN ('fundamental', 'technical', 'earnings')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    sentiment VARCHAR(20) DEFAULT 'neutral'
        CHECK (sentiment IN ('positive', 'negative', 'neutral')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Complete version history (immutable append-only log)
CREATE TABLE IF NOT EXISTS thesis_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thesis_id UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    field_changed VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    change_group_id UUID
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_theses_stock_code ON theses(stock_code);
CREATE INDEX IF NOT EXISTS idx_thesis_kpis_thesis_id ON thesis_kpis(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_break_conditions_thesis_id ON thesis_break_conditions(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_signals_thesis_id ON thesis_signals(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_signals_active ON thesis_signals(thesis_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_thesis_history_thesis_id ON thesis_history(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_history_created_at ON thesis_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thesis_history_change_group ON thesis_history(change_group_id) WHERE change_group_id IS NOT NULL;
