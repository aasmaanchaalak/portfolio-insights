CREATE TABLE pe_valuations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES pe_companies(id) ON DELETE CASCADE UNIQUE,
  table_data JSONB NOT NULL DEFAULT '{"rows":[],"columns":[],"cells":{}}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pe_valuations_company_id ON pe_valuations(company_id);
