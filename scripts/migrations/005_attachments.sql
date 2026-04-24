CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(20) NOT NULL CHECK (module IN ('pe', 'pipeline', 'thesis')),
  entity_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attachments_module_entity ON attachments(module, entity_id);
