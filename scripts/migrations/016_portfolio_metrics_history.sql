-- Time-series snapshots of portfolio-level quality/technical metrics.
-- One row per date; written on every Screener/GridKey upload alongside
-- portfolio_history. Powers the "Quality Trends" chart on the Analysis page.

CREATE TABLE IF NOT EXISTS portfolio_metrics_history (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                    DATE UNIQUE NOT NULL,
  avg_pe                  DECIMAL(18, 4),
  avg_profit_growth       DECIMAL(18, 4),
  avg_sales_growth        DECIMAL(18, 4),
  avg_market_cap          DECIMAL(18, 4),
  avg_rsi                 DECIMAL(18, 4),
  avg_roce                DECIMAL(18, 4),
  avg_dma50               DECIMAL(18, 4),
  avg_dma200              DECIMAL(18, 4),
  avg_down_from_52w_high  DECIMAL(18, 4),
  avg_up_from_52w_low     DECIMAL(18, 4),
  weighted_all_time_gain  DECIMAL(18, 4),
  weighted_1y_return      DECIMAL(18, 4),
  top5_concentration      DECIMAL(18, 4),
  recorded_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_metrics_history_date
  ON portfolio_metrics_history(date DESC);
