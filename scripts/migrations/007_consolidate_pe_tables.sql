-- Migration 007: Consolidate all one-to-one PE tables into pe_companies

-- Add investment columns
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS invested_value DECIMAL(18,2);
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS current_value DECIMAL(18,2);
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS price_per_share DECIMAL(18,4);
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS quantity_held DECIMAL(18,4);
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS ownership_percentage DECIMAL(6,4);
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS investment_date DATE;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS last_valuation_date DATE;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS valuation_source VARCHAR(255);
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'INR';

-- Add thesis columns
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS thesis_status VARCHAR(20) CHECK (thesis_status IN ('intact', 'monitor', 'broken'));
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS original_thesis TEXT;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS key_drivers TEXT;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS latest_note TEXT;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS last_review_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS break_conditions JSONB DEFAULT '[]'::jsonb;

-- Add monitoring columns
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS latest_earnings_update TEXT;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS latest_earnings_date DATE;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS management_guidance TEXT;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS guidance_vs_actual VARCHAR(20) CHECK (guidance_vs_actual IN ('ahead', 'on_track', 'behind', 'missed'));
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS guidance_vs_actual_notes TEXT;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS fy26_annual_report_received BOOLEAN DEFAULT FALSE;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS fy26_annual_report_date DATE;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS last_audited_financials_received DATE;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS latest_deck_received DATE;
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS latest_deck_name VARCHAR(255);

-- Add broker columns
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS broker_name VARCHAR(255);
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS broker_firm VARCHAR(255);
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS broker_email VARCHAR(255);
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS broker_phone VARCHAR(50);
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS broker_notes TEXT;

-- Add valuation table column
ALTER TABLE pe_companies ADD COLUMN IF NOT EXISTS valuation_table JSONB DEFAULT '{"rows":[],"columns":[],"cells":{}}'::jsonb;

-- Migrate investment data
UPDATE pe_companies c SET
  invested_value = i.invested_value,
  current_value = i.current_value,
  price_per_share = i.price_per_share,
  quantity_held = i.quantity_held,
  ownership_percentage = i.ownership_percentage,
  investment_date = i.investment_date,
  last_valuation_date = i.last_valuation_date,
  valuation_source = i.valuation_source,
  currency = COALESCE(i.currency, 'INR')
FROM pe_investments i
WHERE i.company_id = c.id;

-- Migrate thesis data + break conditions as JSONB
UPDATE pe_companies c SET
  thesis_status = t.status,
  original_thesis = t.original_thesis,
  key_drivers = t.key_drivers,
  latest_note = t.latest_note,
  last_review_date = t.updated_at,
  break_conditions = COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', bc.id::text,
        'condition', bc.condition,
        'isTriggered', bc.is_triggered,
        'triggeredAt', bc.triggered_at,
        'sortOrder', bc.sort_order
      ) ORDER BY bc.sort_order
    )::jsonb
    FROM pe_thesis_break_conditions bc
    WHERE bc.thesis_id = t.id
  ), '[]'::jsonb)
FROM pe_theses t
WHERE t.company_id = c.id;

-- Migrate monitoring data
UPDATE pe_companies c SET
  latest_earnings_update = m.latest_earnings_update,
  latest_earnings_date = m.latest_earnings_date,
  management_guidance = m.management_guidance,
  guidance_vs_actual = m.guidance_vs_actual,
  guidance_vs_actual_notes = m.guidance_vs_actual_notes,
  fy26_annual_report_received = m.fy26_annual_report_received,
  fy26_annual_report_date = m.fy26_annual_report_date,
  last_audited_financials_received = m.last_audited_financials_received,
  latest_deck_received = m.latest_deck_received,
  latest_deck_name = m.latest_deck_name
FROM pe_monitoring m
WHERE m.company_id = c.id;

-- Migrate broker data
UPDATE pe_companies c SET
  broker_name = b.broker_name,
  broker_firm = b.broker_firm,
  broker_email = b.broker_email,
  broker_phone = b.broker_phone,
  broker_notes = b.notes
FROM pe_brokers b
WHERE b.company_id = c.id;

-- Migrate valuation table data
UPDATE pe_companies c SET
  valuation_table = v.table_data
FROM pe_valuations v
WHERE v.company_id = c.id;

-- Drop old tables (order matters for FK constraints)
DROP TABLE IF EXISTS pe_thesis_history;
DROP TABLE IF EXISTS pe_thesis_break_conditions;
DROP TABLE IF EXISTS pe_theses;
DROP TABLE IF EXISTS pe_investments;
DROP TABLE IF EXISTS pe_monitoring;
DROP TABLE IF EXISTS pe_brokers;
DROP TABLE IF EXISTS pe_valuations;
