-- Migration: 002_create_pe_tables.sql
-- Private Equity Tracker Module

-- Main PE Companies table
CREATE TABLE IF NOT EXISTS pe_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL,
  company_code VARCHAR(50) UNIQUE NOT NULL,
  sector VARCHAR(100),
  sub_sector VARCHAR(100),
  website VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255)
);

-- Investment details (Overview tab)
CREATE TABLE IF NOT EXISTS pe_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES pe_companies(id) ON DELETE CASCADE,
  invested_value DECIMAL(18, 2) NOT NULL,
  current_value DECIMAL(18, 2),
  price_per_share DECIMAL(18, 4),
  quantity_held DECIMAL(18, 4),
  ownership_percentage DECIMAL(6, 4),
  investment_date DATE,
  last_valuation_date DATE,
  valuation_source VARCHAR(255),
  currency VARCHAR(3) DEFAULT 'INR',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id)
);

-- Thesis table
CREATE TABLE IF NOT EXISTS pe_theses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES pe_companies(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'intact' CHECK (status IN ('intact', 'monitor', 'broken')),
  original_thesis TEXT,
  key_drivers TEXT,
  latest_note TEXT,
  last_review_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id)
);

-- Thesis break conditions
CREATE TABLE IF NOT EXISTS pe_thesis_break_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES pe_theses(id) ON DELETE CASCADE,
  condition TEXT NOT NULL,
  is_triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Thesis history (audit trail)
CREATE TABLE IF NOT EXISTS pe_thesis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID NOT NULL REFERENCES pe_theses(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  field_changed VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  user_email VARCHAR(255),
  change_group_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Monitoring table
CREATE TABLE IF NOT EXISTS pe_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES pe_companies(id) ON DELETE CASCADE,
  latest_earnings_update TEXT,
  latest_earnings_date DATE,
  management_guidance TEXT,
  guidance_vs_actual VARCHAR(20) CHECK (guidance_vs_actual IN ('ahead', 'on_track', 'behind', 'missed')),
  guidance_vs_actual_notes TEXT,
  fy26_annual_report_received BOOLEAN DEFAULT FALSE,
  fy26_annual_report_date DATE,
  last_audited_financials_received DATE,
  latest_deck_received DATE,
  latest_deck_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id)
);

-- Contacts table (SENSITIVE)
CREATE TABLE IF NOT EXISTS pe_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES pe_companies(id) ON DELETE CASCADE,
  contact_type VARCHAR(50) NOT NULL CHECK (contact_type IN ('company_poc', 'broker', 'board_member', 'advisor', 'other')),
  name VARCHAR(255) NOT NULL,
  designation VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  alternate_phone VARCHAR(50),
  notes TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  last_communication_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Broker table (SENSITIVE)
CREATE TABLE IF NOT EXISTS pe_brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES pe_companies(id) ON DELETE CASCADE,
  broker_name VARCHAR(255) NOT NULL,
  broker_firm VARCHAR(255),
  broker_email VARCHAR(255),
  broker_phone VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id)
);

-- Communications timeline
CREATE TABLE IF NOT EXISTS pe_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES pe_companies(id) ON DELETE CASCADE,
  communication_type VARCHAR(50) NOT NULL CHECK (
    communication_type IN ('email', 'call', 'meeting', 'site_visit', 'board_meeting', 'document_received', 'note', 'other')
  ),
  subject VARCHAR(500),
  summary TEXT,
  detailed_notes TEXT,
  communication_date TIMESTAMP WITH TIME ZONE NOT NULL,
  participants TEXT,
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_date DATE,
  follow_up_notes TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pe_companies_code ON pe_companies(company_code);
CREATE INDEX IF NOT EXISTS idx_pe_investments_company ON pe_investments(company_id);
CREATE INDEX IF NOT EXISTS idx_pe_theses_company ON pe_theses(company_id);
CREATE INDEX IF NOT EXISTS idx_pe_theses_status ON pe_theses(status);
CREATE INDEX IF NOT EXISTS idx_pe_thesis_break_conditions_thesis ON pe_thesis_break_conditions(thesis_id);
CREATE INDEX IF NOT EXISTS idx_pe_thesis_history_thesis ON pe_thesis_history(thesis_id);
CREATE INDEX IF NOT EXISTS idx_pe_thesis_history_date ON pe_thesis_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pe_monitoring_company ON pe_monitoring(company_id);
CREATE INDEX IF NOT EXISTS idx_pe_contacts_company ON pe_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_pe_contacts_type ON pe_contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_pe_brokers_company ON pe_brokers(company_id);
CREATE INDEX IF NOT EXISTS idx_pe_communications_company ON pe_communications(company_id);
CREATE INDEX IF NOT EXISTS idx_pe_communications_date ON pe_communications(communication_date DESC);
CREATE INDEX IF NOT EXISTS idx_pe_communications_follow_up ON pe_communications(follow_up_required, follow_up_date) WHERE follow_up_required = TRUE;
