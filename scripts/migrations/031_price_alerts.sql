-- Migration 031: Price alerts and stop-loss alert state
-- Price alerts are set from the stock drawer's Alerts tab and fire once (push)
-- when the live price reaches the target. Stop-loss state tracks holdings that
-- are 20% or more below their average buy price. Also applied at runtime by
-- lib/priceAlerts.ts and lib/stockAlerts.ts.

CREATE TABLE IF NOT EXISTS price_alerts (
  id              SERIAL PRIMARY KEY,
  stock_code      VARCHAR(50) NOT NULL,
  target_price    NUMERIC NOT NULL,
  direction       VARCHAR(5) NOT NULL CHECK (direction IN ('above', 'below')),
  note            TEXT,
  created_by      VARCHAR(255),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  triggered_at    TIMESTAMP WITH TIME ZONE,
  triggered_price NUMERIC
);
CREATE INDEX IF NOT EXISTS price_alerts_code_idx ON price_alerts (stock_code);

ALTER TABLE stock_alert_state
  ADD COLUMN IF NOT EXISTS below_stop_loss BOOLEAN;
