// =============================================================================
// WICKLESS STRATEGY — NO-WICK CANDLE DETECTION
// =============================================================================
// Implements Rule 2: Valid Entry Candle (No-Wick Candle)
//
// Bullish no-bottom-wick (for buys in uptrend):
//   - Candle is bullish: C > O
//   - No bottom wick: L >= O - ε
//   - Meaning: Price opened and never dipped below - buyers dominated
//
// Bearish no-top-wick (for sells in downtrend):
//   - Candle is bearish: C < O
//   - No top wick: H <= O + ε
//   - Meaning: Price opened and never spiked above - sellers dominated
// =============================================================================

import { Candle, Pair, Trend, WicklessResult } from '../../types/types';
import { getTolerance } from '../config';

/**
 * Detects if a candle qualifies as a "no-wick" signal candle
 * based on the current trend direction.
 * 
 * @param candle - The candle to analyze
 * @param pair - Trading pair (for tolerance lookup)
 * @param trend - Current market trend
 * @returns WicklessResult with detection details
 */
export function detectWickless(
  candle: Candle,
  pair: Pair,
  trend: Trend
): WicklessResult {
  // No signals in ranging market (Rule 1)
  if (trend === 'RANGING') {
    return {
      isValid: false,
      direction: null,
      entryZone: null,
      candle: null,
    };
  }

  const tolerance = getTolerance(pair);
  const { open, high, low, close } = candle;

  // Calculate wick sizes for reference
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const bodySize = Math.abs(close - open);

  // Skip doji candles (very small body) - not valid signals
  if (bodySize < tolerance) {
    return {
      isValid: false,
      direction: null,
      entryZone: null,
      candle: null,
    };
  }

  // BULLISH NO-BOTTOM-WICK (Buy signal in uptrend)
  // Condition: C > O (bullish) AND L >= O - ε (no bottom wick)
  if (trend === 'UP') {
    const isBullish = close > open;
    const hasNoBottomWick = low >= open - tolerance;

    if (isBullish && hasNoBottomWick) {
      return {
        isValid: true,
        direction: 'BUY',
        entryZone: low,  // Entry when price retraces to the low
        candle: candle,
      };
    }
  }

  // BEARISH NO-TOP-WICK (Sell signal in downtrend)
  // Condition: C < O (bearish) AND H <= O + ε (no top wick)
  if (trend === 'DOWN') {
    const isBearish = close < open;
    const hasNoTopWick = high <= open + tolerance;

    if (isBearish && hasNoTopWick) {
      return {
        isValid: true,
        direction: 'SELL',
        entryZone: high,  // Entry when price retraces to the high
        candle: candle,
      };
    }
  }

  // No valid wickless candle detected
  return {
    isValid: false,
    direction: null,
    entryZone: null,
    candle: null,
  };
}

/**
 * Scans an array of candles to find wickless signal candles.
 * Only analyzes complete candles.
 * 
 * @param candles - Array of candles (newest last)
 * @param pair - Trading pair
 * @param trend - Current market trend
 * @param maxCandles - Maximum number of recent candles to check
 * @returns Array of valid wickless detections with their indices
 */
export function scanForWicklessCandles(
  candles: Candle[],
  pair: Pair,
  trend: Trend,
  maxCandles: number = 10
): Array<{ index: number; result: WicklessResult }> {
  const results: Array<{ index: number; result: WicklessResult }> = [];
  
  // Start from the most recent complete candle
  const startIndex = Math.max(0, candles.length - maxCandles);
  
  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i];
    
    // Only analyze complete candles
    if (!candle.complete) continue;
    
    const result = detectWickless(candle, pair, trend);
    
    if (result.isValid) {
      results.push({ index: i, result });
    }
  }
  
  return results;
}

/**
 * Gets the most recent wickless candle from an array.
 * 
 * @param candles - Array of candles (newest last)
 * @param pair - Trading pair
 * @param trend - Current market trend
 * @returns The most recent valid wickless result or null
 */
export function getMostRecentWickless(
  candles: Candle[],
  pair: Pair,
  trend: Trend
): { index: number; result: WicklessResult } | null {
  // Check the last complete candle first
  for (let i = candles.length - 1; i >= 0; i--) {
    const candle = candles[i];
    
    if (!candle.complete) continue;
    
    const result = detectWickless(candle, pair, trend);
    
    if (result.isValid) {
      return { index: i, result };
    }
    
    // Only check the most recent complete candle
    break;
  }
  
  return null;
}

/**
 * Calculates detailed wick analysis for debugging/display purposes.
 * 
 * @param candle - The candle to analyze
 * @param pair - Trading pair
 * @returns Detailed wick measurements
 */
export function analyzeWicks(
  candle: Candle,
  pair: Pair
): {
  upperWick: number;
  lowerWick: number;
  bodySize: number;
  range: number;
  upperWickPercent: number;
  lowerWickPercent: number;
  isBullish: boolean;
  tolerance: number;
  meetsNoTopWickCriteria: boolean;
  meetsNoBottomWickCriteria: boolean;
} {
  const tolerance = getTolerance(pair);
  const { open, high, low, close } = candle;
  
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const bodySize = Math.abs(close - open);
  const range = high - low;
  
  return {
    upperWick,
    lowerWick,
    bodySize,
    range,
    upperWickPercent: range > 0 ? (upperWick / range) * 100 : 0,
    lowerWickPercent: range > 0 ? (lowerWick / range) * 100 : 0,
    isBullish: close > open,
    tolerance,
    meetsNoTopWickCriteria: high <= open + tolerance,
    meetsNoBottomWickCriteria: low >= open - tolerance,
  };
}

/**
 * Validates a candle for the wickless strategy.
 * Returns detailed validation info for UI display.
 * 
 * @param candle - The candle to validate
 * @param pair - Trading pair
 * @param trend - Current market trend
 */
export function validateWicklessCandle(
  candle: Candle,
  pair: Pair,
  trend: Trend
): {
  isValid: boolean;
  checks: {
    trendAligned: boolean;
    correctDirection: boolean;
    wickRequirementMet: boolean;
    isComplete: boolean;
    notDoji: boolean;
  };
  reason: string;
} {
  const tolerance = getTolerance(pair);
  const { open, high, low, close } = candle;
  const bodySize = Math.abs(close - open);
  const isBullish = close > open;

  const checks = {
    trendAligned: trend !== 'RANGING',
    correctDirection: 
      (trend === 'UP' && isBullish) || 
      (trend === 'DOWN' && !isBullish),
    wickRequirementMet: 
      (trend === 'UP' && isBullish && low >= open - tolerance) ||
      (trend === 'DOWN' && !isBullish && high <= open + tolerance),
    isComplete: candle.complete,
    notDoji: bodySize >= tolerance,
  };

  const isValid = Object.values(checks).every(Boolean);

  let reason = '';
  if (!checks.trendAligned) reason = 'Market is ranging - no trades';
  else if (!checks.isComplete) reason = 'Candle is not complete';
  else if (!checks.notDoji) reason = 'Candle body too small (doji)';
  else if (!checks.correctDirection) reason = `Need ${trend === 'UP' ? 'bullish' : 'bearish'} candle for ${trend.toLowerCase()}trend`;
  else if (!checks.wickRequirementMet) reason = `Has ${trend === 'UP' ? 'bottom' : 'top'} wick - not valid`;
  else reason = 'Valid wickless signal candle';

  return { isValid, checks, reason };
}
