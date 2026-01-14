// =============================================================================
// WICKLESS STRATEGY — SCANNER ORCHESTRATOR
// =============================================================================
// Main scanning engine that:
// 1. Fetches candles from OANDA
// 2. Analyzes trend (swing points → HH/HL or LH/LL)
// 3. Detects wickless candles
// 4. Calculates SL/TP from structure
// 5. Returns complete scan results
// =============================================================================

import { 
  Candle, 
  Pair, 
  Timeframe, 
  Trend,
  TradeSetup,
  ScanResult,
  TrendAnalysis,
  WicklessResult 
} from '../../types/types';

import { RECOMMENDED_PAIRS, STRATEGY_CONFIG } from '../config';

import { 
  fetchCandles, 
  fetchCandlesViaProxy,
  getCompleteCandles,
  hasEnoughCandles 
} from '../oanda';

import { 
  classifyTrend, 
  analyzeTrend,
  isTrendTradeable,
  getAllowedDirection 
} from '../detection/trend';

import { 
  detectWickless,
  getMostRecentWickless 
} from '../detection/wickless';

import { 
  calculateTradeSetup,
  validateSetup 
} from '../detection/structure';

import { findSwingPoints } from '../detection/swingPoints';

// -----------------------------------------------------------------------------
// Core Scanner Function
// -----------------------------------------------------------------------------

export interface ScanOptions {
  pair: Pair;
  timeframe: Timeframe;
  proxyUrl?: string;
  candleCount?: number;
}

export interface DetailedScanResult extends ScanResult {
  trendAnalysis: TrendAnalysis;
  wicklessResult: WicklessResult;
  setupValidation: { valid: boolean; reason: string } | null;
  candleCount: number;
  scanDuration: number;
}

/**
 * Performs a complete scan for a single pair
 * This is the main entry point for signal detection
 * 
 * @param options - Scan configuration
 * @returns Detailed scan result
 */
export async function scanPair(options: ScanOptions): Promise<DetailedScanResult> {
  const startTime = Date.now();
  const { pair, timeframe, proxyUrl, candleCount = STRATEGY_CONFIG.CANDLES_TO_FETCH } = options;
  
  // Initialize result
  const result: DetailedScanResult = {
    pair,
    timeframe,
    trend: 'RANGING',
    wicklessDetected: false,
    wicklessCandle: null,
    setup: null,
    timestamp: new Date().toISOString(),
    trendAnalysis: {
      trend: 'RANGING',
      swingHighs: [],
      swingLows: [],
      latestHH: null,
      latestHL: null,
      latestLH: null,
      latestLL: null,
    },
    wicklessResult: {
      isValid: false,
      direction: null,
      entryZone: null,
      candle: null,
    },
    setupValidation: null,
    candleCount: 0,
    scanDuration: 0,
  };

  try {
    // Step 1: Fetch candles
    const candles = proxyUrl 
      ? await fetchCandlesViaProxy(proxyUrl, pair, timeframe, candleCount)
      : await fetchCandles(pair, timeframe, candleCount);
    
    const completeCandles = getCompleteCandles(candles);
    result.candleCount = completeCandles.length;

    // Validate we have enough data
    if (!hasEnoughCandles(candles)) {
      result.scanDuration = Date.now() - startTime;
      return result;
    }

    // Step 2: Analyze trend
    result.trendAnalysis = analyzeTrend(completeCandles);
    result.trend = result.trendAnalysis.trend;

    // Step 3: Check if trend is tradeable
    if (!isTrendTradeable(completeCandles)) {
      result.scanDuration = Date.now() - startTime;
      return result;
    }

    // Step 4: Get the most recent complete candle and check for wickless
    const lastCandle = completeCandles[completeCandles.length - 1];
    const wicklessResult = detectWickless(lastCandle, pair, result.trend);
    result.wicklessResult = wicklessResult;

    if (!wicklessResult.isValid) {
      result.scanDuration = Date.now() - startTime;
      return result;
    }

    // Step 5: Valid wickless candle found!
    result.wicklessDetected = true;
    result.wicklessCandle = wicklessResult.candle;

    // Step 6: Calculate trade setup (SL/TP)
    const direction = getAllowedDirection(result.trend);
    if (direction && wicklessResult.entryZone !== null) {
      const setup = calculateTradeSetup(
        direction,
        wicklessResult.entryZone,
        completeCandles,
        pair
      );

      if (setup) {
        result.setup = setup;
        result.setupValidation = validateSetup(setup, pair);
      }
    }

  } catch (error) {
    console.error(`Scan error for ${pair}:`, error);
  }

  result.scanDuration = Date.now() - startTime;
  return result;
}

// -----------------------------------------------------------------------------
// Multi-Pair Scanner
// -----------------------------------------------------------------------------

export interface MultiScanOptions {
  pairs?: Pair[];
  timeframe: Timeframe;
  proxyUrl?: string;
  candleCount?: number;
}

export interface MultiScanResult {
  results: DetailedScanResult[];
  signalsFound: DetailedScanResult[];
  totalDuration: number;
  timestamp: string;
}

/**
 * Scans multiple pairs for wickless setups
 * 
 * @param options - Multi-scan configuration
 * @returns Results for all pairs with signals highlighted
 */
export async function scanMultiplePairs(options: MultiScanOptions): Promise<MultiScanResult> {
  const startTime = Date.now();
  const { 
    pairs = RECOMMENDED_PAIRS, 
    timeframe, 
    proxyUrl, 
    candleCount 
  } = options;

  // Scan all pairs in parallel
  const scanPromises = pairs.map(pair => 
    scanPair({ pair, timeframe, proxyUrl, candleCount })
  );

  const results = await Promise.all(scanPromises);

  // Filter to only valid signals
  const signalsFound = results.filter(r => 
    r.wicklessDetected && 
    r.setup !== null && 
    r.setupValidation?.valid === true
  );

  return {
    results,
    signalsFound,
    totalDuration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

// -----------------------------------------------------------------------------
// Quick Check Functions
// -----------------------------------------------------------------------------

/**
 * Quick check if a pair has a tradeable trend (without full scan)
 */
export async function checkTrend(
  pair: Pair,
  timeframe: Timeframe,
  proxyUrl?: string
): Promise<{ pair: Pair; trend: Trend; tradeable: boolean }> {
  try {
    const candles = proxyUrl
      ? await fetchCandlesViaProxy(proxyUrl, pair, timeframe, 50)
      : await fetchCandles(pair, timeframe, 50);
    
    const trend = classifyTrend(getCompleteCandles(candles));
    
    return {
      pair,
      trend,
      tradeable: trend !== 'RANGING',
    };
  } catch (error) {
    return {
      pair,
      trend: 'RANGING',
      tradeable: false,
    };
  }
}

/**
 * Quick check trends for multiple pairs
 */
export async function checkAllTrends(
  pairs: Pair[],
  timeframe: Timeframe,
  proxyUrl?: string
): Promise<Map<Pair, { trend: Trend; tradeable: boolean }>> {
  const results = new Map<Pair, { trend: Trend; tradeable: boolean }>();
  
  const promises = pairs.map(async pair => {
    const result = await checkTrend(pair, timeframe, proxyUrl);
    results.set(pair, { trend: result.trend, tradeable: result.tradeable });
  });
  
  await Promise.all(promises);
  return results;
}

// -----------------------------------------------------------------------------
// Historical Scanning (for backtesting)
// -----------------------------------------------------------------------------

export interface HistoricalScanOptions {
  pair: Pair;
  timeframe: Timeframe;
  candles: Candle[];
  startIndex?: number;
}

/**
 * Scans historical candles for wickless setups
 * Useful for backtesting without API calls
 * 
 * @param options - Historical scan configuration
 * @returns Array of scan results at each candle
 */
export function scanHistorical(options: HistoricalScanOptions): DetailedScanResult[] {
  const { pair, timeframe, candles, startIndex = 50 } = options;
  const results: DetailedScanResult[] = [];
  
  // Need enough candles for swing detection
  if (candles.length < startIndex) {
    return results;
  }

  // Scan at each candle position
  for (let i = startIndex; i < candles.length; i++) {
    const candleSlice = candles.slice(0, i + 1);
    const completeCandles = candleSlice.filter(c => c.complete);
    
    if (completeCandles.length < 20) continue;

    const startTime = Date.now();
    
    // Analyze trend
    const trendAnalysis = analyzeTrend(completeCandles);
    const trend = trendAnalysis.trend;
    
    // Initialize result
    const result: DetailedScanResult = {
      pair,
      timeframe,
      trend,
      wicklessDetected: false,
      wicklessCandle: null,
      setup: null,
      timestamp: completeCandles[completeCandles.length - 1].time,
      trendAnalysis,
      wicklessResult: {
        isValid: false,
        direction: null,
        entryZone: null,
        candle: null,
      },
      setupValidation: null,
      candleCount: completeCandles.length,
      scanDuration: 0,
    };

    // Check for wickless if trend is tradeable
    if (trend !== 'RANGING') {
      const lastCandle = completeCandles[completeCandles.length - 1];
      const wicklessResult = detectWickless(lastCandle, pair, trend);
      result.wicklessResult = wicklessResult;

      if (wicklessResult.isValid) {
        result.wicklessDetected = true;
        result.wicklessCandle = wicklessResult.candle;

        const direction = getAllowedDirection(trend);
        if (direction && wicklessResult.entryZone !== null) {
          const setup = calculateTradeSetup(
            direction,
            wicklessResult.entryZone,
            completeCandles,
            pair
          );

          if (setup) {
            result.setup = setup;
            result.setupValidation = validateSetup(setup, pair);
          }
        }
      }
    }

    result.scanDuration = Date.now() - startTime;
    results.push(result);
  }

  return results;
}

// -----------------------------------------------------------------------------
// Summary Helpers
// -----------------------------------------------------------------------------

/**
 * Creates a summary of scan results for logging/display
 */
export function summarizeScanResult(result: DetailedScanResult): string {
  const lines: string[] = [];
  
  lines.push(`=== ${result.pair} @ ${result.timeframe} ===`);
  lines.push(`Trend: ${result.trend}`);
  lines.push(`Candles analyzed: ${result.candleCount}`);
  lines.push(`Scan duration: ${result.scanDuration}ms`);
  
  if (result.wicklessDetected) {
    lines.push(`✅ WICKLESS SIGNAL DETECTED`);
    lines.push(`Direction: ${result.setup?.direction}`);
    lines.push(`Entry Zone: ${result.setup?.entryZone}`);
    lines.push(`Stop Loss: ${result.setup?.stopLoss}`);
    lines.push(`Take Profit: ${result.setup?.takeProfit}`);
    lines.push(`Risk: ${result.setup?.riskPips?.toFixed(1)} pips`);
    
    if (result.setupValidation) {
      lines.push(`Validation: ${result.setupValidation.valid ? '✅' : '❌'} ${result.setupValidation.reason}`);
    }
  } else {
    lines.push(`No signal detected`);
    if (result.trend === 'RANGING') {
      lines.push(`Reason: Market is ranging`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Creates a summary of multi-pair scan results
 */
export function summarizeMultiScan(result: MultiScanResult): string {
  const lines: string[] = [];
  
  lines.push(`=== MULTI-PAIR SCAN RESULTS ===`);
  lines.push(`Time: ${result.timestamp}`);
  lines.push(`Total duration: ${result.totalDuration}ms`);
  lines.push(`Pairs scanned: ${result.results.length}`);
  lines.push(`Signals found: ${result.signalsFound.length}`);
  lines.push('');
  
  // Trend summary
  lines.push('Trend Summary:');
  for (const r of result.results) {
    const icon = r.trend === 'UP' ? '📈' : r.trend === 'DOWN' ? '📉' : '➖';
    const signal = r.wicklessDetected ? '🎯' : '';
    lines.push(`  ${icon} ${r.pair}: ${r.trend} ${signal}`);
  }
  
  // Signal details
  if (result.signalsFound.length > 0) {
    lines.push('');
    lines.push('Signal Details:');
    for (const s of result.signalsFound) {
      lines.push(`  ${s.pair}: ${s.setup?.direction} @ ${s.setup?.entryZone}`);
    }
  }
  
  return lines.join('\n');
}
