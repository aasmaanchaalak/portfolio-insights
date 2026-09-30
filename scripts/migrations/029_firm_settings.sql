-- Migration 029: Firm branding + benchmark in app_settings
-- Firm name, short (home-screen) name, logo and benchmark index are edited in
-- Admin → Firm Settings (lib/firmSettings.ts). Unset keys fall back to
-- "Portfolio Insights", no logo, and Nifty Smallcap 100.
--
-- Existing deployment: seed the current Sagun branding so nothing changes on
-- deploy. A new firm's deployment can skip these rows and set them in the UI.

INSERT INTO app_settings (key, value) VALUES
  ('firm_name', 'Sagun Capital'),
  ('firm_short_name', 'Sagun'),
  ('firm_logo', '/sagun-capital-logo.png'),
  ('benchmark_index', 'NIFTY SMLCAP 100')
ON CONFLICT (key) DO NOTHING;
