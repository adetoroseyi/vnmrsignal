// =============================================================================
// WICKLESS STRATEGY — STRUCTURE-BASED SL/TP CALCULATION
// =============================================================================
// Implements:
// - Rule 5: Stop Loss Placement (at market structure)
// - Rule 6: Take Profit (1:1 Risk to Reward)
//
// For BUY trades:
//   SL = Most recent Higher Low - buffer (1-2 pips)
//   TP = Entry + (Entry - SL)
//
// For SELL trades:
//   SL = Most recent Lower High + buffer (1-2 pips)
//   TP = Entry - (SL - Entry)
// =============================================================================

import { Candle, Pair, SwingPoint, TradeSetup } from '../../types/types';
import { getSLBuffer, getPipMultiplier, formatPrice, formatPips } from '../config';
import { getStructureForSL, getMostRecentSwingLow, getMostRecentSwingHigh } from './swingPoints';

/**
 * Calculates the complete trade setup with entry, SL, and TP.
 * 
 * @param direction - Trade direction ('BUY' or 'SELL')
 * @param entryZone - Entry price level (from wickless candle detection)
 * @param candles - Array of candles for structure analysis
 * @param pair - Trading pair (for buffer and pip calculations)
 * @returns Complete trade setup or null if structure not found
 */
export function calculateTradeSetup(
  direction: 'BUY' | 'SELL',
  entryZone: number,
  candles: Candle[],
  pair: Pair
): TradeSetup | null {
  const buffer = getSLBuffer(pair);
  const structurePoint = getStructureForSL(candles, direction);

  if (!structurePoint) {
    return null;
  }

  let stopLoss: number;
  let takeProfit: number;
  let riskPips: number;

  if (direction === 'BUY') {
    // SL below the most recent Higher Low
    stopLoss = structurePoint.price - buffer;
    
    // Calculate risk in price terms
    const risk = entryZone - stopLoss;
    
    // TP at 1:1 (same distance above entry)
    takeProfit = entryZone + risk;
    
    // Convert to pips for display
    riskPips = risk * getPipMultiplier(pair);
  } else {
    // SL above the most recent Lower High
    stopLoss = structurePoint.price + buffer;
    
    // Calculate risk in price terms
    const risk = stopLoss - entryZone;
    
    // TP at 1:1 (same distance below entry)
    takeProfit = entryZone - risk;
    
    // Convert to pips for display
    riskPips = risk * getPipMultiplier(pair);
  }

  return {
    direction,
    entryZone,
    stopLoss,
    takeProfit,
    riskPips,
    structurePoint,
  };
}

/**
 * Validates that a trade setup has acceptable risk parameters.
 * 
 * @param setup - The trade setup to validate
 * @param pair - Trading pair
 * @param minPips - Minimum acceptable risk in pips (default: 5)
 * @param maxPips - Maximum acceptable risk in pips (default: 50)
 * @returns Validation result with reason if invalid
 */
export function validateSetup(
  setup: TradeSetup,
  pair: Pair,
  minPips: number = 5,
  maxPips: number = 50
): { valid: boolean; reason: string } {
  // Check minimum risk (avoid trades with too tight SL)
  if (setup.riskPips < minPips) {
    return {
      valid: false,
      reason: `Risk too small: ${setup.riskPips.toFixed(1)} pips (min: ${minPips})`,
    };
  }

  // Check maximum risk (avoid trades with excessive SL)
  if (setup.riskPips > maxPips) {
    return {
      valid: false,
      reason: `Risk too large: ${setup.riskPips.toFixed(1)} pips (max: ${maxPips})`,
    };
  }

  // Verify entry is between SL and TP
  if (setup.direction === 'BUY') {
    if (setup.entryZone <= setup.stopLoss) {
      return {
        valid: false,
        reason: 'Entry must be above Stop Loss for BUY',
      };
    }
    if (setup.entryZone >= setup.takeProfit) {
      return {
        valid: false,
        reason: 'Entry must be below Take Profit for BUY',
      };
    }
  } else {
    if (setup.entryZone >= setup.stopLoss) {
      return {
        valid: false,
        reason: 'Entry must be below Stop Loss for SELL',
      };
    }
    if (setup.entryZone <= setup.takeProfit) {
      return {
        valid: false,
        reason: 'Entry must be above Take Profit for SELL',
      };
    }
  }

  return { valid: true, reason: 'Setup is valid' };
}

/**
 * Calculates position size based on account risk percentage.
 * 
 * @param accountBalance - Account balance in base currency
 * @param riskPercent - Risk percentage per trade (e.g., 1 for 1%)
 * @param riskPips - Risk in pips from trade setup
 * @param pipValue - Value of 1 pip per lot (varies by pair)
 * @returns Position size in lots
 */
export function calculatePositionSize(
  accountBalance: number,
  riskPercent: number,
  riskPips: number,
  pipValue: number
): number {
  const riskAmount = accountBalance * (riskPercent / 100);
  const positionSize = riskAmount / (riskPips * pipValue);
  
  // Round to 2 decimal places (0.01 lot minimum)
  return Math.floor(positionSize * 100) / 100;
}

/**
 * Formats a trade setup for display.
 * 
 * @param setup - The trade setup
 * @param pair - Trading pair
 * @returns Formatted string representation
 */
export function formatTradeSetup(setup: TradeSetup, pair: Pair): string {
  const arrow = setup.direction === 'BUY' ? '🟢' : '🔴';
  
  return [
    `${arrow} ${setup.direction} Setup`,
    `Entry Zone: ${formatPrice(setup.entryZone, pair)}`,
    `Stop Loss:  ${formatPrice(setup.stopLoss, pair)}`,
    `Take Profit: ${formatPrice(setup.takeProfit, pair)}`,
    `Risk: ${formatPips(setup.riskPips)} pips`,
    `R:R: 1:1`,
    `Structure: ${setup.structurePoint.type} @ ${formatPrice(setup.structurePoint.price, pair)}`,
  ].join('\n');
}

/**
 * Checks if current price has hit SL or TP.
 * 
 * @param setup - The trade setup
 * @param currentHigh - Current candle high
 * @param currentLow - Current candle low
 * @returns Outcome status
 */
export function checkOutcome(
  setup: TradeSetup,
  currentHigh: number,
  currentLow: number
): 'WIN' | 'LOSS' | 'OPEN' {
  if (setup.direction === 'BUY') {
    // For BUY: TP hit if high >= TP, SL hit if low <= SL
    if (currentHigh >= setup.takeProfit) return 'WIN';
    if (currentLow <= setup.stopLoss) return 'LOSS';
  } else {
    // For SELL: TP hit if low <= TP, SL hit if high >= SL
    if (currentLow <= setup.takeProfit) return 'WIN';
    if (currentHigh >= setup.stopLoss) return 'LOSS';
  }
  
  return 'OPEN';
}

/**
 * Checks if current price would trigger entry.
 * 
 * @param setup - The trade setup
 * @param currentHigh - Current candle high
 * @param currentLow - Current candle low
 * @returns Whether entry would be triggered
 */
export function checkEntryTrigger(
  setup: TradeSetup,
  currentHigh: number,
  currentLow: number
): boolean {
  if (setup.direction === 'BUY') {
    // For BUY: Entry when price retraces down to entry zone
    return currentLow <= setup.entryZone;
  } else {
    // For SELL: Entry when price retraces up to entry zone
    return currentHigh >= setup.entryZone;
  }
}

/**
 * Calculates the distance to entry zone from current price.
 * Positive = price needs to move toward entry
 * Negative = price has already passed entry
 * 
 * @param setup - The trade setup
 * @param currentPrice - Current market price
 * @param pair - Trading pair
 * @returns Distance in pips
 */
export function distanceToEntry(
  setup: TradeSetup,
  currentPrice: number,
  pair: Pair
): number {
  const distance = setup.direction === 'BUY'
    ? currentPrice - setup.entryZone  // Price needs to come down
    : setup.entryZone - currentPrice; // Price needs to go up
  
  return distance * getPipMultiplier(pair);
}

/**
 * Creates a summary object for API responses.
 * 
 * @param setup - The trade setup
 * @param pair - Trading pair
 */
export function createSetupSummary(setup: TradeSetup, pair: Pair): {
  direction: 'BUY' | 'SELL';
  entry: string;
  sl: string;
  tp: string;
  riskPips: string;
  ratio: string;
} {
  return {
    direction: setup.direction,
    entry: formatPrice(setup.entryZone, pair),
    sl: formatPrice(setup.stopLoss, pair),
    tp: formatPrice(setup.takeProfit, pair),
    riskPips: formatPips(setup.riskPips),
    ratio: '1:1',
  };
}

/**
 * Adjusts setup for spread (useful for live trading).
 * 
 * @param setup - The trade setup
 * @param spread - Current spread in price terms
 * @returns Adjusted setup accounting for spread
 */
export function adjustForSpread(
  setup: TradeSetup,
  spread: number
): TradeSetup {
  const adjusted = { ...setup };
  
  if (setup.direction === 'BUY') {
    // BUY orders fill at ASK (higher), so entry is worse by spread
    adjusted.entryZone = setup.entryZone + spread;
    adjusted.takeProfit = setup.takeProfit + spread;
    // SL stays at the same market level
  } else {
    // SELL orders fill at BID (lower), so entry is worse by spread
    adjusted.entryZone = setup.entryZone - spread;
    adjusted.takeProfit = setup.takeProfit - spread;
    // SL stays at the same market level
  }
  
  return adjusted;
}
