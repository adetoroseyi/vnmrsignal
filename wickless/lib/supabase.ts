// =============================================================================
// WICKLESS STRATEGY — SUPABASE CLIENT
// =============================================================================
// Database operations for storing and retrieving signals
// =============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  ActiveSetup, 
  Signal, 
  Pair, 
  Timeframe,
  PairStats 
} from '../types/types';
import { DetailedScanResult } from './signals/scanner';

// -----------------------------------------------------------------------------
// Client Initialization
// -----------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// -----------------------------------------------------------------------------
// Active Setups Operations
// -----------------------------------------------------------------------------

/**
 * Saves a new active setup to the database
 */
export async function saveActiveSetup(setup: ActiveSetup): Promise<ActiveSetup | null> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('active_setups')
    .insert({
      id: setup.id,
      pair: setup.pair,
      timeframe: setup.timeframe,
      direction: setup.direction,
      signal_candle_time: setup.signalCandleTime,
      signal_candle_open: setup.signalCandleOpen,
      signal_candle_high: setup.signalCandleHigh,
      signal_candle_low: setup.signalCandleLow,
      signal_candle_close: setup.signalCandleClose,
      entry_zone: setup.entryZone,
      stop_loss: setup.stopLoss,
      take_profit: setup.takeProfit,
      candles_elapsed: setup.candlesElapsed,
      status: setup.status,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving active setup:', error);
    return null;
  }

  return mapDbToActiveSetup(data);
}

/**
 * Gets all active (WAITING) setups
 */
export async function getActiveSetups(): Promise<ActiveSetup[]> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('active_setups')
    .select('*')
    .eq('status', 'WAITING')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting active setups:', error);
    return [];
  }

  return data.map(mapDbToActiveSetup);
}

/**
 * Gets active setups for a specific pair and timeframe
 */
export async function getActiveSetupsFor(
  pair: Pair, 
  timeframe: Timeframe
): Promise<ActiveSetup[]> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('active_setups')
    .select('*')
    .eq('pair', pair)
    .eq('timeframe', timeframe)
    .eq('status', 'WAITING');

  if (error) {
    console.error('Error getting active setups:', error);
    return [];
  }

  return data.map(mapDbToActiveSetup);
}

/**
 * Updates a setup's status and candles elapsed
 */
export async function updateSetup(
  id: string, 
  updates: { 
    status?: string; 
    candlesElapsed?: number;
  }
): Promise<boolean> {
  const client = getSupabaseClient();
  
  const dbUpdates: Record<string, unknown> = {};
  if (updates.status) dbUpdates.status = updates.status;
  if (updates.candlesElapsed !== undefined) dbUpdates.candles_elapsed = updates.candlesElapsed;

  const { error } = await client
    .from('active_setups')
    .update(dbUpdates)
    .eq('id', id);

  if (error) {
    console.error('Error updating setup:', error);
    return false;
  }

  return true;
}

/**
 * Marks a setup as triggered
 */
export async function markSetupTriggered(id: string): Promise<boolean> {
  return updateSetup(id, { status: 'TRIGGERED' });
}

/**
 * Marks a setup as expired
 */
export async function markSetupExpired(id: string): Promise<boolean> {
  return updateSetup(id, { status: 'EXPIRED' });
}

/**
 * Increments candle count for a setup
 */
export async function incrementCandleCount(id: string, currentCount: number): Promise<boolean> {
  return updateSetup(id, { candlesElapsed: currentCount + 1 });
}

/**
 * Checks if a setup already exists for this signal candle
 */
export async function setupExists(pair: Pair, signalTime: string): Promise<boolean> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('active_setups')
    .select('id')
    .eq('pair', pair)
    .eq('signal_candle_time', signalTime)
    .limit(1);

  if (error) {
    console.error('Error checking setup existence:', error);
    return false;
  }

  return data.length > 0;
}

// -----------------------------------------------------------------------------
// Signals Operations
// -----------------------------------------------------------------------------

/**
 * Saves a triggered signal
 */
export async function saveSignal(signal: Signal): Promise<Signal | null> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('signals')
    .insert({
      id: signal.id,
      setup_id: signal.setupId,
      pair: signal.pair,
      timeframe: signal.timeframe,
      direction: signal.direction,
      entry_price: signal.entryPrice,
      stop_loss: signal.stopLoss,
      take_profit: signal.takeProfit,
      entry_time: signal.entryTime,
      outcome: signal.outcome,
      outcome_time: signal.outcomeTime,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving signal:', error);
    return null;
  }

  return mapDbToSignal(data);
}

/**
 * Gets all open signals (no outcome yet)
 */
export async function getOpenSignals(): Promise<Signal[]> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('signals')
    .select('*')
    .is('outcome', null)
    .order('entry_time', { ascending: false });

  if (error) {
    console.error('Error getting open signals:', error);
    return [];
  }

  return data.map(mapDbToSignal);
}

/**
 * Gets recent signals (with or without outcomes)
 */
export async function getRecentSignals(limit: number = 50): Promise<Signal[]> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('signals')
    .select('*')
    .order('entry_time', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error getting recent signals:', error);
    return [];
  }

  return data.map(mapDbToSignal);
}

/**
 * Updates signal outcome
 */
export async function updateSignalOutcome(
  id: string, 
  outcome: 'WIN' | 'LOSS',
  outcomeTime: string,
  outcomePrice?: number
): Promise<boolean> {
  const client = getSupabaseClient();
  
  const updates: Record<string, unknown> = {
    outcome,
    outcome_time: outcomeTime,
  };
  if (outcomePrice !== undefined) {
    updates.outcome_price = outcomePrice;
  }

  const { error } = await client
    .from('signals')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating signal outcome:', error);
    return false;
  }

  return true;
}

// -----------------------------------------------------------------------------
// Stats Operations
// -----------------------------------------------------------------------------

/**
 * Gets stats for all pairs
 */
export async function getAllStats(): Promise<PairStats[]> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('v_performance_by_pair')
    .select('*');

  if (error) {
    console.error('Error getting stats:', error);
    return [];
  }

  return data.map((row: Record<string, unknown>) => ({
    pair: row.pair as Pair,
    timeframe: 'ALL' as Timeframe,
    totalSignals: Number(row.total_signals) || 0,
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    expired: Number(row.expired) || 0,
    winRate: Number(row.win_rate) || 0,
  }));
}

/**
 * Gets stats for a specific pair
 */
export async function getStatsForPair(pair: Pair): Promise<PairStats | null> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('stats')
    .select('*')
    .eq('pair', pair);

  if (error) {
    console.error('Error getting pair stats:', error);
    return null;
  }

  if (data.length === 0) return null;

  // Aggregate all timeframes for this pair
  const totals = data.reduce(
    (acc, row) => ({
      totalSignals: acc.totalSignals + (row.total_signals || 0),
      wins: acc.wins + (row.wins || 0),
      losses: acc.losses + (row.losses || 0),
      expired: acc.expired + (row.expired || 0),
    }),
    { totalSignals: 0, wins: 0, losses: 0, expired: 0 }
  );

  const total = totals.wins + totals.losses;

  return {
    pair,
    timeframe: 'ALL' as Timeframe,
    totalSignals: totals.totalSignals,
    wins: totals.wins,
    losses: totals.losses,
    expired: totals.expired,
    winRate: total > 0 ? (totals.wins / total) * 100 : 0,
  };
}

// -----------------------------------------------------------------------------
// Scan Log Operations
// -----------------------------------------------------------------------------

/**
 * Logs a scan result
 */
export async function logScan(
  pairs: Pair[],
  timeframe: Timeframe,
  results: DetailedScanResult[],
  duration: number
): Promise<void> {
  const client = getSupabaseClient();
  
  const signalsFound = results.filter(r => r.wicklessDetected && r.setup).length;

  const { error } = await client
    .from('scan_logs')
    .insert({
      pairs_scanned: pairs,
      timeframe,
      signals_found: signalsFound,
      results: JSON.stringify(results.map(r => ({
        pair: r.pair,
        trend: r.trend,
        wicklessDetected: r.wicklessDetected,
        setup: r.setup ? {
          direction: r.setup.direction,
          entryZone: r.setup.entryZone,
          stopLoss: r.setup.stopLoss,
          takeProfit: r.setup.takeProfit,
        } : null,
      }))),
      duration_ms: duration,
    });

  if (error) {
    console.error('Error logging scan:', error);
  }
}

/**
 * Gets recent scan logs
 */
export async function getRecentScans(limit: number = 20): Promise<unknown[]> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('scan_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error getting scan logs:', error);
    return [];
  }

  return data;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

function mapDbToActiveSetup(row: Record<string, unknown>): ActiveSetup {
  return {
    id: row.id as string,
    pair: row.pair as string,
    timeframe: row.timeframe as Timeframe,
    direction: row.direction as 'BUY' | 'SELL',
    signalCandleTime: row.signal_candle_time as string,
    signalCandleOpen: Number(row.signal_candle_open),
    signalCandleHigh: Number(row.signal_candle_high),
    signalCandleLow: Number(row.signal_candle_low),
    signalCandleClose: Number(row.signal_candle_close),
    entryZone: Number(row.entry_zone),
    stopLoss: Number(row.stop_loss),
    takeProfit: Number(row.take_profit),
    candlesElapsed: Number(row.candles_elapsed),
    status: row.status as 'WAITING' | 'TRIGGERED' | 'EXPIRED',
    createdAt: row.created_at as string,
  };
}

function mapDbToSignal(row: Record<string, unknown>): Signal {
  return {
    id: row.id as string,
    setupId: row.setup_id as string,
    pair: row.pair as string,
    timeframe: row.timeframe as Timeframe,
    direction: row.direction as 'BUY' | 'SELL',
    entryPrice: Number(row.entry_price),
    stopLoss: Number(row.stop_loss),
    takeProfit: Number(row.take_profit),
    entryTime: row.entry_time as string,
    outcome: row.outcome as 'WIN' | 'LOSS' | null,
    outcomeTime: row.outcome_time as string | null,
    createdAt: row.created_at as string,
  };
}

// -----------------------------------------------------------------------------
// Batch Operations
// -----------------------------------------------------------------------------

/**
 * Creates setup from scan result and saves to database
 */
export async function createAndSaveSetup(
  scanResult: DetailedScanResult
): Promise<ActiveSetup | null> {
  if (!scanResult.wicklessDetected || !scanResult.wicklessCandle || !scanResult.setup) {
    return null;
  }

  // Check if already exists
  const exists = await setupExists(
    scanResult.pair, 
    scanResult.wicklessCandle.time
  );
  
  if (exists) {
    console.log(`Setup already exists for ${scanResult.pair} at ${scanResult.wicklessCandle.time}`);
    return null;
  }

  const setup: ActiveSetup = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    pair: scanResult.pair,
    timeframe: scanResult.timeframe,
    direction: scanResult.setup.direction,
    signalCandleTime: scanResult.wicklessCandle.time,
    signalCandleOpen: scanResult.wicklessCandle.open,
    signalCandleHigh: scanResult.wicklessCandle.high,
    signalCandleLow: scanResult.wicklessCandle.low,
    signalCandleClose: scanResult.wicklessCandle.close,
    entryZone: scanResult.setup.entryZone,
    stopLoss: scanResult.setup.stopLoss,
    takeProfit: scanResult.setup.takeProfit,
    candlesElapsed: 0,
    status: 'WAITING',
    createdAt: new Date().toISOString(),
  };

  return saveActiveSetup(setup);
}

/**
 * Expires all setups that have exceeded 10 candles
 */
export async function expireOldSetups(): Promise<number> {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('active_setups')
    .update({ status: 'EXPIRED' })
    .eq('status', 'WAITING')
    .gte('candles_elapsed', 10)
    .select();

  if (error) {
    console.error('Error expiring old setups:', error);
    return 0;
  }

  return data.length;
}
