-- =============================================================================
-- WICKLESS STRATEGY — DATABASE SCHEMA
-- =============================================================================
-- Run this in Supabase SQL Editor to create all tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Active Setups Table
-- -----------------------------------------------------------------------------
-- Stores detected wickless candles waiting for retracement entry
-- Status: WAITING → TRIGGERED or EXPIRED

CREATE TABLE IF NOT EXISTS active_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair VARCHAR(10) NOT NULL,
  timeframe VARCHAR(5) NOT NULL,
  direction VARCHAR(4) NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  
  -- Signal candle OHLC
  signal_candle_time TIMESTAMPTZ NOT NULL,
  signal_candle_open DECIMAL(20, 10) NOT NULL,
  signal_candle_high DECIMAL(20, 10) NOT NULL,
  signal_candle_low DECIMAL(20, 10) NOT NULL,
  signal_candle_close DECIMAL(20, 10) NOT NULL,
  
  -- Trade levels
  entry_zone DECIMAL(20, 10) NOT NULL,
  stop_loss DECIMAL(20, 10) NOT NULL,
  take_profit DECIMAL(20, 10) NOT NULL,
  
  -- Tracking
  candles_elapsed INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'TRIGGERED', 'EXPIRED')),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_active_setups_pair ON active_setups(pair);
CREATE INDEX IF NOT EXISTS idx_active_setups_status ON active_setups(status);
CREATE INDEX IF NOT EXISTS idx_active_setups_timeframe ON active_setups(timeframe);

-- -----------------------------------------------------------------------------
-- Signals Table
-- -----------------------------------------------------------------------------
-- Stores triggered entries and their outcomes

CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID REFERENCES active_setups(id) ON DELETE SET NULL,
  
  pair VARCHAR(10) NOT NULL,
  timeframe VARCHAR(5) NOT NULL,
  direction VARCHAR(4) NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  
  -- Entry details
  entry_price DECIMAL(20, 10) NOT NULL,
  stop_loss DECIMAL(20, 10) NOT NULL,
  take_profit DECIMAL(20, 10) NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  
  -- Outcome
  outcome VARCHAR(10) CHECK (outcome IN ('WIN', 'LOSS', NULL)),
  outcome_time TIMESTAMPTZ,
  outcome_price DECIMAL(20, 10),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_signals_pair ON signals(pair);
CREATE INDEX IF NOT EXISTS idx_signals_outcome ON signals(outcome);
CREATE INDEX IF NOT EXISTS idx_signals_entry_time ON signals(entry_time);

-- -----------------------------------------------------------------------------
-- Stats Table
-- -----------------------------------------------------------------------------
-- Aggregated performance stats per pair/timeframe

CREATE TABLE IF NOT EXISTS stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair VARCHAR(10) NOT NULL,
  timeframe VARCHAR(5) NOT NULL,
  
  -- Counts
  total_signals INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  expired INT DEFAULT 0,
  
  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint
  UNIQUE(pair, timeframe)
);

-- -----------------------------------------------------------------------------
-- Scan Log Table
-- -----------------------------------------------------------------------------
-- Logs each scan for debugging and monitoring

CREATE TABLE IF NOT EXISTS scan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scan details
  pairs_scanned TEXT[] NOT NULL,
  timeframe VARCHAR(5) NOT NULL,
  signals_found INT DEFAULT 0,
  
  -- Results summary (JSON)
  results JSONB,
  
  -- Performance
  duration_ms INT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_scan_logs_created ON scan_logs(created_at DESC);

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

-- Function to update stats when a signal outcome is recorded
CREATE OR REPLACE FUNCTION update_stats_on_outcome()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.outcome IS NOT NULL AND OLD.outcome IS NULL THEN
    INSERT INTO stats (pair, timeframe, total_signals, wins, losses)
    VALUES (
      NEW.pair,
      NEW.timeframe,
      1,
      CASE WHEN NEW.outcome = 'WIN' THEN 1 ELSE 0 END,
      CASE WHEN NEW.outcome = 'LOSS' THEN 1 ELSE 0 END
    )
    ON CONFLICT (pair, timeframe) DO UPDATE SET
      total_signals = stats.total_signals + 1,
      wins = stats.wins + CASE WHEN NEW.outcome = 'WIN' THEN 1 ELSE 0 END,
      losses = stats.losses + CASE WHEN NEW.outcome = 'LOSS' THEN 1 ELSE 0 END,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for stats update
DROP TRIGGER IF EXISTS trigger_update_stats ON signals;
CREATE TRIGGER trigger_update_stats
  AFTER UPDATE ON signals
  FOR EACH ROW
  EXECUTE FUNCTION update_stats_on_outcome();

-- Function to update stats when a setup expires
CREATE OR REPLACE FUNCTION update_stats_on_expire()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'EXPIRED' AND OLD.status = 'WAITING' THEN
    INSERT INTO stats (pair, timeframe, expired)
    VALUES (NEW.pair, NEW.timeframe, 1)
    ON CONFLICT (pair, timeframe) DO UPDATE SET
      expired = stats.expired + 1,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for expire stats
DROP TRIGGER IF EXISTS trigger_update_stats_expire ON active_setups;
CREATE TRIGGER trigger_update_stats_expire
  AFTER UPDATE ON active_setups
  FOR EACH ROW
  EXECUTE FUNCTION update_stats_on_expire();

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at on active_setups
DROP TRIGGER IF EXISTS trigger_updated_at_setups ON active_setups;
CREATE TRIGGER trigger_updated_at_setups
  BEFORE UPDATE ON active_setups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- -----------------------------------------------------------------------------
-- Views
-- -----------------------------------------------------------------------------

-- View for active (waiting) setups with remaining candles
CREATE OR REPLACE VIEW v_active_setups AS
SELECT 
  id,
  pair,
  timeframe,
  direction,
  entry_zone,
  stop_loss,
  take_profit,
  candles_elapsed,
  10 - candles_elapsed AS candles_remaining,
  signal_candle_time,
  created_at
FROM active_setups
WHERE status = 'WAITING'
ORDER BY created_at DESC;

-- View for recent signals with outcomes
CREATE OR REPLACE VIEW v_recent_signals AS
SELECT 
  id,
  pair,
  timeframe,
  direction,
  entry_price,
  stop_loss,
  take_profit,
  entry_time,
  outcome,
  outcome_time,
  created_at
FROM signals
ORDER BY entry_time DESC
LIMIT 100;

-- View for performance by pair
CREATE OR REPLACE VIEW v_performance_by_pair AS
SELECT 
  pair,
  SUM(total_signals) AS total_signals,
  SUM(wins) AS wins,
  SUM(losses) AS losses,
  SUM(expired) AS expired,
  CASE 
    WHEN SUM(wins) + SUM(losses) > 0 
    THEN ROUND(SUM(wins)::DECIMAL / (SUM(wins) + SUM(losses)) * 100, 2)
    ELSE 0 
  END AS win_rate
FROM stats
GROUP BY pair
ORDER BY win_rate DESC;

-- View for performance by timeframe
CREATE OR REPLACE VIEW v_performance_by_timeframe AS
SELECT 
  timeframe,
  SUM(total_signals) AS total_signals,
  SUM(wins) AS wins,
  SUM(losses) AS losses,
  SUM(expired) AS expired,
  CASE 
    WHEN SUM(wins) + SUM(losses) > 0 
    THEN ROUND(SUM(wins)::DECIMAL / (SUM(wins) + SUM(losses)) * 100, 2)
    ELSE 0 
  END AS win_rate
FROM stats
GROUP BY timeframe
ORDER BY win_rate DESC;

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS) - Optional
-- -----------------------------------------------------------------------------
-- Uncomment if you want to enable RLS

-- ALTER TABLE active_setups ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stats ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;

-- Public read access (for dashboard)
-- CREATE POLICY "Public read access" ON active_setups FOR SELECT USING (true);
-- CREATE POLICY "Public read access" ON signals FOR SELECT USING (true);
-- CREATE POLICY "Public read access" ON stats FOR SELECT USING (true);
-- CREATE POLICY "Public read access" ON scan_logs FOR SELECT USING (true);
