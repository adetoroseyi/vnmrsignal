// =============================================================================
// WICKLESS STRATEGY — TREND CLASSIFICATION
// =============================================================================
// Implements Rule 1: Trade ONLY with the trend
//
// Uptrend:   Higher Highs (HH) AND Higher Lows (HL)
// Downtrend: Lower Highs (LH) AND Lower Lows (LL)
// Ranging:   Mixed or unclear structure (NO TRADE)
//
// Visual representation:
//
// Uptrend:                    Downtrend:
//       HH                    LH
//      /  \                  /  \
//    SH    \               SH    \
//   /       \             /       \
// HL         \          LL         \
//   \        HH           \        LH
//    \      /              \      /
//     HL --                 LL --
// =============================================================================

import { Candle, SwingPoint, Trend, TrendAnalysis } from '../../types/types';
import { STRATEGY_CONFIG } from '../config';
import { 
  findSwingPoints, 
  getSwingRelationships,
  hasEnoughSwingPoints 
} from './swingPoints';

/**
 * Classifies the current market trend based on swing point structure.
 * 
 * @param candles - Array of candles (oldest first)
 * @param lookback - Swing detection lookback period
 * @returns Trend classification: 'UP', 'DOWN', or 'RANGING'
 */
export function classifyTrend(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): Trend {
  // Need minimum swing points for reliable classification
  if (!hasEnoughSwingPoints(candles, lookback)) {
    return 'RANGING';
  }

  const relationships = getSwingRelationships(candles, lookback);
  const { hasHigherHigh, hasHigherLow, hasLowerHigh, hasLowerLow } = relationships;

  // Uptrend: Both higher high AND higher low
  if (hasHigherHigh === true && hasHigherLow === true) {
    return 'UP';
  }

  // Downtrend: Both lower high AND lower low
  if (hasLowerHigh === true && hasLowerLow === true) {
    return 'DOWN';
  }

  // Everything else is ranging (mixed signals, not enough data, etc.)
  return 'RANGING';
}

/**
 * Provides detailed trend analysis with all swing point information.
 * Useful for UI display and debugging.
 * 
 * @param candles - Array of candles (oldest first)
 * @param lookback - Swing detection lookback period
 * @returns Complete trend analysis with swing points
 */
export function analyzeTrend(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): TrendAnalysis {
  const swings = findSwingPoints(candles, lookback);
  const highs = swings.filter(s => s.type === 'HIGH');
  const lows = swings.filter(s => s.type === 'LOW');

  // Get the last two of each for comparison
  const recentHighs = highs.slice(-2);
  const recentLows = lows.slice(-2);

  // Determine trend classification
  const trend = classifyTrend(candles, lookback);

  // Identify specific swing points based on trend
  let latestHH: SwingPoint | null = null;
  let latestHL: SwingPoint | null = null;
  let latestLH: SwingPoint | null = null;
  let latestLL: SwingPoint | null = null;

  if (recentHighs.length >= 2) {
    const [prev, curr] = recentHighs;
    if (curr.price > prev.price) {
      latestHH = curr; // Current is a Higher High
    } else if (curr.price < prev.price) {
      latestLH = curr; // Current is a Lower High
    }
  }

  if (recentLows.length >= 2) {
    const [prev, curr] = recentLows;
    if (curr.price > prev.price) {
      latestHL = curr; // Current is a Higher Low
    } else if (curr.price < prev.price) {
      latestLL = curr; // Current is a Lower Low
    }
  }

  return {
    trend,
    swingHighs: highs,
    swingLows: lows,
    latestHH,
    latestHL,
    latestLH,
    latestLL,
  };
}

/**
 * Validates if the trend is tradeable (not ranging).
 * 
 * @param candles - Array of candles
 * @param lookback - Swing detection lookback period
 * @returns Whether the market has a clear trend
 */
export function isTrendTradeable(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): boolean {
  const trend = classifyTrend(candles, lookback);
  return trend !== 'RANGING';
}

/**
 * Gets a human-readable description of the current trend.
 * 
 * @param candles - Array of candles
 * @param lookback - Swing detection lookback period
 * @returns Description string
 */
export function getTrendDescription(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): string {
  const analysis = analyzeTrend(candles, lookback);
  
  switch (analysis.trend) {
    case 'UP':
      return `Uptrend - Higher Highs and Higher Lows confirmed. Look for BUY setups only.`;
    case 'DOWN':
      return `Downtrend - Lower Highs and Lower Lows confirmed. Look for SELL setups only.`;
    case 'RANGING':
      return `Ranging/Unclear - No clear trend structure. Do NOT trade.`;
    default:
      return 'Unknown market condition';
  }
}

/**
 * Calculates trend strength based on the magnitude of swing differences.
 * Higher values indicate stronger trends.
 * 
 * @param candles - Array of candles
 * @param lookback - Swing detection lookback period
 * @returns Strength value (0-100) or null if ranging
 */
export function calculateTrendStrength(
  candles: Candle[],
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): number | null {
  const analysis = analyzeTrend(candles, lookback);
  
  if (analysis.trend === 'RANGING') {
    return null;
  }

  const highs = analysis.swingHighs.slice(-2);
  const lows = analysis.swingLows.slice(-2);

  if (highs.length < 2 || lows.length < 2) {
    return null;
  }

  // Calculate average price for normalization
  const avgPrice = (highs[1].price + lows[1].price) / 2;
  
  // Calculate percentage moves
  const highDiff = Math.abs(highs[1].price - highs[0].price) / avgPrice * 100;
  const lowDiff = Math.abs(lows[1].price - lows[0].price) / avgPrice * 100;
  
  // Average the two and cap at 100
  const strength = Math.min((highDiff + lowDiff) / 2 * 10, 100);
  
  return Math.round(strength);
}

/**
 * Checks if trend direction matches the expected direction for a signal.
 * 
 * @param trend - Current trend
 * @param signalDirection - Expected signal direction
 * @returns Whether they align
 */
export function isTrendAligned(
  trend: Trend,
  signalDirection: 'BUY' | 'SELL'
): boolean {
  if (trend === 'RANGING') return false;
  if (trend === 'UP' && signalDirection === 'BUY') return true;
  if (trend === 'DOWN' && signalDirection === 'SELL') return true;
  return false;
}

/**
 * Gets the allowed trade direction for the current trend.
 * 
 * @param trend - Current trend
 * @returns Allowed direction or null if ranging
 */
export function getAllowedDirection(trend: Trend): 'BUY' | 'SELL' | null {
  switch (trend) {
    case 'UP':
      return 'BUY';
    case 'DOWN':
      return 'SELL';
    default:
      return null;
  }
}

/**
 * Formats trend analysis for display/logging.
 * 
 * @param analysis - TrendAnalysis object
 * @returns Formatted string
 */
export function formatTrendAnalysis(analysis: TrendAnalysis): string {
  const lines: string[] = [];
  
  lines.push(`Trend: ${analysis.trend}`);
  lines.push(`Swing Highs: ${analysis.swingHighs.length}`);
  lines.push(`Swing Lows: ${analysis.swingLows.length}`);
  
  if (analysis.latestHH) {
    lines.push(`Latest HH: ${analysis.latestHH.price.toFixed(5)}`);
  }
  if (analysis.latestHL) {
    lines.push(`Latest HL: ${analysis.latestHL.price.toFixed(5)}`);
  }
  if (analysis.latestLH) {
    lines.push(`Latest LH: ${analysis.latestLH.price.toFixed(5)}`);
  }
  if (analysis.latestLL) {
    lines.push(`Latest LL: ${analysis.latestLL.price.toFixed(5)}`);
  }
  
  return lines.join('\n');
}

/**
 * Detects potential trend change (early warning).
 * A trend change might be occurring when:
 * - In uptrend: Latest swing high is lower than previous (potential LH forming)
 * - In downtrend: Latest swing low is higher than previous (potential HL forming)
 * 
 * @param candles - Array of candles
 * @param currentTrend - The established trend
 * @param lookback - Swing detection lookback period
 * @returns Warning object if trend change detected
 */
export function detectTrendChangeWarning(
  candles: Candle[],
  currentTrend: Trend,
  lookback: number = STRATEGY_CONFIG.SWING_LOOKBACK
): { warning: boolean; message: string } | null {
  if (currentTrend === 'RANGING') {
    return null;
  }

  const relationships = getSwingRelationships(candles, lookback);

  if (currentTrend === 'UP') {
    // In uptrend, watch for potential lower high
    if (relationships.hasLowerHigh === true) {
      return {
        warning: true,
        message: 'Potential trend change: Lower High forming in uptrend',
      };
    }
    // Also watch for lower low (stronger warning)
    if (relationships.hasLowerLow === true) {
      return {
        warning: true,
        message: 'Warning: Lower Low formed - trend may be reversing',
      };
    }
  }

  if (currentTrend === 'DOWN') {
    // In downtrend, watch for potential higher low
    if (relationships.hasHigherLow === true) {
      return {
        warning: true,
        message: 'Potential trend change: Higher Low forming in downtrend',
      };
    }
    // Also watch for higher high (stronger warning)
    if (relationships.hasHigherHigh === true) {
      return {
        warning: true,
        message: 'Warning: Higher High formed - trend may be reversing',
      };
    }
  }

  return null;
}
