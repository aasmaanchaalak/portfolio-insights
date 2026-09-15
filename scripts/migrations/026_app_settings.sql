-- Migration 026: Global app settings (key/value)
-- Small key/value store for app-wide settings. First use: the admin-controlled
-- "current fiscal year" (ending year, e.g. 2027) that drives the forward window
-- for Forward Metrics defaults and the Public Portfolio forward-IRR columns.
-- (Also created lazily at runtime by ensureAppSettingsTable in lib/queries.ts.)

CREATE TABLE IF NOT EXISTS app_settings (
  key        VARCHAR(64) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
