// =============================================================================
// WICKLESS STRATEGY — CONFIGURATION
// =============================================================================

import { Pair, PairConfig, Timeframe, TimeframeConfig } from '../types/types';

// -----------------------------------------------------------------------------
// Pair Configurations
// -----------------------------------------------------------------------------
// tolerance (ε): For no-wick detection - allows tiny decimal variations
// slBuffer: Added to SL for breathing room (Rule 5)
// pipMultiplier: For converting price differences to pips

export const PAIR_CONFIGS: Record<Pair, PairConfig> = {
  EUR_USD: {
    symbol: 'EUR_USD',
    displayName: 'EUR/USD',
    tolerance: 0.00002,    // ~0.2 pips
    slBuffer: 0.0002,      // 2 pips
    pipMultiplier: 10000,
  },
  GBP_USD: {
    symbol: 'GBP_USD',
    displayName: 'GBP/USD',
    tolerance: 0.00002,
    slBuffer: 0.0002,
    pipMultiplier: 10000,
  },
  AUD_USD: {
    symbol: 'AUD_USD',
    displayName: 'AUD/USD',
    tolerance: 0.00002,
    slBuffer: 0.0002,
    pipMultiplier: 10000,
  },
  USD_JPY: {
    symbol: 'USD_JPY',
    displayName: 'USD/JPY',
    tolerance: 0.002,      // ~0.2 pips (JPY pairs use 2 decimals)
    slBuffer: 0.02,        // 2 pips
    pipMultiplier: 100,
  },
  XAU_USD: {
    symbol: 'XAU_USD',
    displayName: 'Gold (XAU/USD)',
    tolerance: 0.02,       // Gold has larger price movements
    slBuffer: 0.20,        // ~20 cents buffer
    pipMultiplier: 10,
  },
};

// -----------------------------------------------------------------------------
// Timeframe Configurations
// -----------------------------------------------------------------------------
// scanInterval: How often to scan (in milliseconds)
// oandaGranularity: OANDA API granularity parameter

export const TIMEFRAME_CONFIGS: Record<Timeframe, TimeframeConfig> = {
  M15: {
    value: 'M15',
    displayName: '15 Minutes',
    scanInterval: 60000,         // Every 1 minute
    oandaGranularity: 'M15',
  },
  M30: {
    value: 'M30',
    displayName: '30 Minutes',
    scanInterval: 120000,        // Every 2 minutes
    oandaGranularity: 'M30',
  },
  H1: {
    value: 'H1',
    displayName: '1 Hour',
    scanInterval: 300000,        // Every 5 minutes
    oandaGranularity: 'H1',
  },
  H4: {
    value: 'H4',
    displayName: '4 Hours',
    scanInterval: 900000,        // Every 15 minutes
    oandaGranularity: 'H4',
  },
};

// -----------------------------------------------------------------------------
// Strategy Constants
// -----------------------------------------------------------------------------

export const STRATEGY_CONFIG = {
  // Swing point detection lookback (Rule 1 - Market Structure)
  SWING_LOOKBACK: 3,
  
  // Maximum candles to wait for retracement (Rule 4)
  MAX_CANDLES_FOR_ENTRY: 10,
  
  // Risk to Reward ratio (Rule 6)
  RISK_REWARD_RATIO: 1,
  
  // Number of candles to fetch for analysis
  // Need enough for swing detection + current analysis
  CANDLES_TO_FETCH: 100,
  
  // Minimum swing points needed for trend classification
  MIN_SWING_POINTS: 4,
};

// -----------------------------------------------------------------------------
// Recommended Pairs (Rule 8)
// -----------------------------------------------------------------------------

export const RECOMMENDED_PAIRS: Pair[] = [
  'USD_JPY',   // Best performance
  'GBP_USD',   // Good
  'AUD_USD',   // Good
  'XAU_USD',   // Lower win rate - not for beginners
];

// Priority order for scanning
export const PAIR_PRIORITY: Record<Pair, number> = {
  USD_JPY: 1,
  GBP_USD: 2,
  AUD_USD: 3,
  EUR_USD: 4,
  XAU_USD: 5,
};

// -----------------------------------------------------------------------------
// Valid Timeframes (Rule 7)
// -----------------------------------------------------------------------------

export const VALID_TIMEFRAMES: Timeframe[] = ['M15', 'M30', 'H1', 'H4'];

// Default timeframe
export const DEFAULT_TIMEFRAME: Timeframe = 'M15';

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

export function getPairConfig(pair: Pair): PairConfig {
  return PAIR_CONFIGS[pair];
}

export function getTimeframeConfig(timeframe: Timeframe): TimeframeConfig {
  return TIMEFRAME_CONFIGS[timeframe];
}

export function getTolerance(pair: Pair): number {
  return PAIR_CONFIGS[pair].tolerance;
}

export function getSLBuffer(pair: Pair): number {
  return PAIR_CONFIGS[pair].slBuffer;
}

export function getPipMultiplier(pair: Pair): number {
  return PAIR_CONFIGS[pair].pipMultiplier;
}

export function priceToPips(price: number, pair: Pair): number {
  return price * getPipMultiplier(pair);
}

export function pipToPrice(pips: number, pair: Pair): number {
  return pips / getPipMultiplier(pair);
}

export function formatPrice(price: number, pair: Pair): string {
  const decimals = pair === 'USD_JPY' ? 3 : pair === 'XAU_USD' ? 2 : 5;
  return price.toFixed(decimals);
}

export function formatPips(pips: number): string {
  return pips.toFixed(1);
}

// -----------------------------------------------------------------------------
// OANDA API Configuration
// -----------------------------------------------------------------------------

export const OANDA_CONFIG = {
  // These will be set via environment variables
  API_URL: process.env.OANDA_API_URL || 'https://api-fxpractice.oanda.com',
  ACCOUNT_ID: process.env.OANDA_ACCOUNT_ID || '',
  API_KEY: process.env.OANDA_API_KEY || '',
};

// -----------------------------------------------------------------------------
// Validation Helpers
// -----------------------------------------------------------------------------

export function isValidPair(pair: string): pair is Pair {
  return pair in PAIR_CONFIGS;
}

export function isValidTimeframe(timeframe: string): timeframe is Timeframe {
  return timeframe in TIMEFRAME_CONFIGS;
}

export function isRecommendedPair(pair: Pair): boolean {
  return RECOMMENDED_PAIRS.includes(pair);
}
