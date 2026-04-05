-- Migration: 003_redis_to_postgres.sql
-- Migrate all Redis data to PostgreSQL

-- ============ Authentication ============

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  user_email VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============ Portfolio Data ============

-- Main portfolio data (screener CSV data)
CREATE TABLE IF NOT EXISTS portfolio_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GridKey holdings data
CREATE TABLE IF NOT EXISTS gridkey_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Private investments summary
CREATE TABLE IF NOT EXISTS private_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_invested DECIMAL(18, 2) DEFAULT 0,
  count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Portfolio value history
CREATE TABLE IF NOT EXISTS portfolio_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  value DECIMAL(18, 2) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_history_date ON portfolio_history(date DESC);

-- ============ Stock Metadata (per-stock) ============

-- Stock remarks
CREATE TABLE IF NOT EXISTS stock_remarks (
  stock_code VARCHAR(50) PRIMARY KEY,
  remarks TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stock assignments
CREATE TABLE IF NOT EXISTS stock_assignments (
  stock_code VARCHAR(50) PRIMARY KEY,
  assigned_to VARCHAR(255),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stock buckets
CREATE TABLE IF NOT EXISTS stock_buckets (
  stock_code VARCHAR(50) PRIMARY KEY,
  bucket VARCHAR(100),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stock positioning
CREATE TABLE IF NOT EXISTS stock_positioning (
  stock_code VARCHAR(50) PRIMARY KEY,
  conviction VARCHAR(50) NOT NULL DEFAULT 'none',
  strategy_type VARCHAR(50) NOT NULL DEFAULT 'none',
  action_intent VARCHAR(50) NOT NULL DEFAULT 'hold',
  time_horizon VARCHAR(50),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stock entry data (entry date and price)
CREATE TABLE IF NOT EXISTS stock_entry_data (
  stock_code VARCHAR(50) PRIMARY KEY,
  entry_date DATE,
  entry_price DECIMAL(18, 4),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============ Dashboard Data ============

-- Technical states snapshot
CREATE TABLE IF NOT EXISTS technical_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code VARCHAR(50) NOT NULL,
  stock_name VARCHAR(255),
  above_50dma BOOLEAN DEFAULT FALSE,
  above_200dma BOOLEAN DEFAULT FALSE,
  dma50_above_200 BOOLEAN DEFAULT FALSE,
  near_52week_high BOOLEAN DEFAULT FALSE,
  near_52week_low BOOLEAN DEFAULT FALSE,
  profit_growth_above_15 BOOLEAN DEFAULT FALSE,
  sales_growth_above_15 BOOLEAN DEFAULT FALSE,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(stock_code)
);

CREATE INDEX IF NOT EXISTS idx_technical_states_stock ON technical_states(stock_code);

-- Dashboard alerts
CREATE TABLE IF NOT EXISTS dashboard_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code VARCHAR(50) NOT NULL,
  stock_name VARCHAR(255),
  alert_type VARCHAR(100) NOT NULL,
  message TEXT,
  current_price DECIMAL(18, 4),
  threshold_value DECIMAL(18, 4),
  change_percent DECIMAL(10, 4),
  triggered_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_stock ON dashboard_alerts(stock_code);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON dashboard_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON dashboard_alerts(alert_type);

-- ============ Cache ============

-- Generic cache table (for nifty-smallcap and other cached data)
CREATE TABLE IF NOT EXISTS cache (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);

-- ============ Helper function for cache ============

-- Function to get cached value (returns NULL if expired)
CREATE OR REPLACE FUNCTION get_cache(cache_key VARCHAR)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT value INTO result
  FROM cache
  WHERE key = cache_key
    AND (expires_at IS NULL OR expires_at > NOW());
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to set cache with optional TTL
CREATE OR REPLACE FUNCTION set_cache(cache_key VARCHAR, cache_value JSONB, ttl_seconds INTEGER DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  INSERT INTO cache (key, value, expires_at)
  VALUES (
    cache_key,
    cache_value,
    CASE WHEN ttl_seconds IS NOT NULL THEN NOW() + (ttl_seconds || ' seconds')::INTERVAL ELSE NULL END
  )
  ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    expires_at = EXCLUDED.expires_at,
    created_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============ Cleanup job for expired data ============

-- Function to clean up expired sessions and cache
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  temp_count INTEGER;
BEGIN
  -- Delete expired sessions
  DELETE FROM sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count := deleted_count + temp_count;

  -- Delete expired cache entries
  DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count := deleted_count + temp_count;

  -- Delete alerts older than 24 hours
  DELETE FROM dashboard_alerts WHERE created_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS temp_count = ROW_COUNT;
  deleted_count := deleted_count + temp_count;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
