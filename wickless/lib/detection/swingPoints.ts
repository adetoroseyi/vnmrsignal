// =============================================================================
// WICKLESS STRATEGY — SWING POINT DETECTION
// =============================================================================
// Implements market structure identification for:
// - Rule 1: Trend identification (HH, HL for uptrend / LH, LL for downtrend)
// - Rule 5: Stop loss placement at structure points
//
// Swing High: A candle where High > High of N candles before AND after
// Swing Low: A candle where Low < Low of N candles before AND after
//
// Default lookback N = 3 (configurable)
// =============================================================================

import { Candle, SwingPoint } from '../../types/types';
import { STRATEGY_CONFIG } from '../config';

/**
 * Identifies all swing points (highs and lows) in a candle array.
 * 
 * A swing high occurs when a candle's high is greater than
 * the highs of N candles on both sides.
 * 
 * A swing low occurs when a candle's low is less than
 * the lows of N candles on both sides.
 * 
 * @param candles - Array of candles (oldest first)
 * @param lookback - Number of candles to check on each side (default: 3)
 * @returns Array of swing points sorted by index
 */
export function findSwingPoints(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): SwingPoint[] {
  const swings: SwingPoint[] = [];
  
  // Need at least lookback candles on each side
  if (candles.length < lookback * 2 + 1) {
    return swings;
  }

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    // Check candles on both sides
    for (let j = 1; j <= lookback; j++) {
      const leftCandle = candles[i - j];
      const rightCandle = candles[i + j];

      // Swing High: current high must be strictly greater than neighbors
      if (leftCandle.high >= current.high || rightCandle.high >= current.high) {
        isSwingHigh = false;
      }

      // Swing Low: current low must be strictly less than neighbors
      if (leftCandle.low <= current.low || rightCandle.low <= current.low) {
        isSwingLow = false;
      }

      // Early exit if neither condition can be met
      if (!isSwingHigh && !isSwingLow) break;
    }

    if (isSwingHigh) {
      swings.push({
        index: i,
        time: current.time,
        price: current.high,
        type: 'HIGH',
      });
    }

    if (isSwingLow) {
      swings.push({
        index: i,
        time: current.time,
        price: current.low,
        type: 'LOW',
      });
    }
  }

  // Sort by index (chronological order)
  return swings.sort((a, b) => a.index - b.index);
}

/**
 * Finds swing highs only.
 * 
 * @param candles - Array of candles
 * @param lookback - Number of candles to check on each side
 * @returns Array of swing high points
 */
export function findSwingHighs(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): SwingPoint[] {
  return findSwingPoints(candles, lookback).filter(s => s.type === 'HIGH');
}

/**
 * Finds swing lows only.
 * 
 * @param candles - Array of candles
 * @param lookback - Number of candles to check on each side
 * @returns Array of swing low points
 */
export function findSwingLows(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): SwingPoint[] {
  return findSwingPoints(candles, lookback).filter(s => s.type === 'LOW');
}

/**
 * Gets the most recent swing high.
 * 
 * @param candles - Array of candles
 * @param lookback - Number of candles to check on each side
 * @returns Most recent swing high or null
 */
export function getMostRecentSwingHigh(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): SwingPoint | null {
  const highs = findSwingHighs(candles, lookback);
  return highs.length > 0 ? highs[highs.length - 1] : null;
}

/**
 * Gets the most recent swing low.
 * 
 * @param candles - Array of candles
 * @param lookback - Number of candles to check on each side
 * @returns Most recent swing low or null
 */
export function getMostRecentSwingLow(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): SwingPoint | null {
  const lows = findSwingLows(candles, lookback);
  return lows.length > 0 ? lows[lows.length - 1] : null;
}

/**
 * Gets the last N swing points of a specific type.
 * 
 * @param candles - Array of candles
 * @param type - 'HIGH' or 'LOW'
 * @param count - Number of swing points to return
 * @param lookback - Number of candles to check on each side
 * @returns Array of the most recent N swing points
 */
export function getLastNSwings(
  candles: Candle[],
  type: 'HIGH' | 'LOW',
  count: number,
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): SwingPoint[] {
  const swings = findSwingPoints(candles, lookback).filter(s => s.type === type);
  return swings.slice(-count);
}

/**
 * Compares two swing highs to determine higher high.
 * 
 * @param current - Current swing high
 * @param previous - Previous swing high
 * @returns true if current is a higher high
 */
export function isHigherHigh(current: SwingPoint, previous: SwingPoint): boolean {
  if (current.type !== 'HIGH' || previous.type !== 'HIGH') {
    throw new Error('Both swing points must be HIGHs');
  }
  return current.price > previous.price;
}

/**
 * Compares two swing lows to determine higher low.
 * 
 * @param current - Current swing low
 * @param previous - Previous swing low
 * @returns true if current is a higher low
 */
export function isHigherLow(current: SwingPoint, previous: SwingPoint): boolean {
  if (current.type !== 'LOW' || previous.type !== 'LOW') {
    throw new Error('Both swing points must be LOWs');
  }
  return current.price > previous.price;
}

/**
 * Compares two swing highs to determine lower high.
 * 
 * @param current - Current swing high
 * @param previous - Previous swing high
 * @returns true if current is a lower high
 */
export function isLowerHigh(current: SwingPoint, previous: SwingPoint): boolean {
  if (current.type !== 'HIGH' || previous.type !== 'HIGH') {
    throw new Error('Both swing points must be HIGHs');
  }
  return current.price < previous.price;
}

/**
 * Compares two swing lows to determine lower low.
 * 
 * @param current - Current swing low
 * @param previous - Previous swing low
 * @returns true if current is a lower low
 */
export function isLowerLow(current: SwingPoint, previous: SwingPoint): boolean {
  if (current.type !== 'LOW' || previous.type !== 'LOW') {
    throw new Error('Both swing points must be LOWs');
  }
  return current.price < previous.price;
}

/**
 * Gets swing point relationships for trend analysis.
 * Returns the last two highs and lows with their relationship status.
 * 
 * @param candles - Array of candles
 * @param lookback - Number of candles to check on each side
 */
export function getSwingRelationships(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): {
  highs: SwingPoint[];
  lows: SwingPoint[];
  hasHigherHigh: boolean | null;
  hasHigherLow: boolean | null;
  hasLowerHigh: boolean | null;
  hasLowerLow: boolean | null;
} {
  const swings = findSwingPoints(candles, lookback);
  const highs = swings.filter(s => s.type === 'HIGH').slice(-2);
  const lows = swings.filter(s => s.type === 'LOW').slice(-2);

  let hasHigherHigh: boolean | null = null;
  let hasHigherLow: boolean | null = null;
  let hasLowerHigh: boolean | null = null;
  let hasLowerLow: boolean | null = null;

  if (highs.length >= 2) {
    hasHigherHigh = isHigherHigh(highs[1], highs[0]);
    hasLowerHigh = isLowerHigh(highs[1], highs[0]);
  }

  if (lows.length >= 2) {
    hasHigherLow = isHigherLow(lows[1], lows[0]);
    hasLowerLow = isLowerLow(lows[1], lows[0]);
  }

  return {
    highs,
    lows,
    hasHigherHigh,
    hasHigherLow,
    hasLowerHigh,
    hasLowerLow,
  };
}

/**
 * Finds the swing point to use for stop loss placement.
 * For BUY: Most recent swing low (Higher Low in uptrend)
 * For SELL: Most recent swing high (Lower High in downtrend)
 * 
 * @param candles - Array of candles
 * @param direction - Trade direction
 * @param lookback - Number of candles to check on each side
 * @returns The swing point for SL or null if not found
 */
export function getStructureForSL(
  candles: Candle[],
  direction: 'BUY' | 'SELL',
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): SwingPoint | null {
  if (direction === 'BUY') {
    return getMostRecentSwingLow(candles, lookback);
  } else {
    return getMostRecentSwingHigh(candles, lookback);
  }
}

/**
 * Validates that enough swing points exist for reliable analysis.
 * 
 * @param candles - Array of candles
 * @param lookback - Number of candles to check on each side
 * @param minRequired - Minimum swing points needed (default from config)
 * @returns Whether sufficient swing points exist
 */
export function hasEnoughSwingPoints(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK,
  minRequired: number = STRATEGY_CONFIG.MIN_SWING_POINTS
): boolean {
  const swings = findSwingPoints(candles, lookback);
  return swings.length >= minRequired;
}

/**
 * Debug helper: Formats swing points for console output.
 * 
 * @param swings - Array of swing points
 * @returns Formatted string representation
 */
export function formatSwingPoints(swings: SwingPoint[]): string {
  return swings
    .map(s => `${s.type === 'HIGH' ? '▲' : '▼'} ${s.price.toFixed(5)} @ index ${s.index}`)
    .join('\n');
}
