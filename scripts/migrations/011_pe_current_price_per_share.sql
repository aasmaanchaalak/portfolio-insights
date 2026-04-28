-- Add current price per share to PE companies. Current value is derived from
-- current_price_per_share * quantity_held in the API layer.

ALTER TABLE pe_companies
  ADD COLUMN IF NOT EXISTS current_price_per_share DECIMAL(18, 4);
