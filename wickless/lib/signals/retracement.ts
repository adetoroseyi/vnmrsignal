// =============================================================================
// WICKLESS STRATEGY — RETRACEMENT MONITORING
// =============================================================================
// Implements:
// - Rule 3: Entry Trigger (Retracement to signal candle)
// - Rule 4: The 10-Candle Rule
//
// After a valid no-wick candle is detected, we monitor for price
// to retrace back to that candle's entry zone:
// - BUY: Wait for price to tap down to the signal candle's Low
// - SELL: Wait for price to tap up to the signal candle's High
//
// The setup expires after 10 candles if price doesn't retrace.
// =============================================================================

import { Candle, RetracementCheck, TradeSetup, ActiveSetup } from '../../types/types';
import { STRATEGY_CONFIG } from '../config';

/**
 * Checks if price has retraced to the entry zone.
 * 
 * @param direction - Trade direction
 * @param entryZone - Target price level for entry
 * @param subsequentCandles - Candles after the signal candle
 * @returns Retracement check result
 */
export function checkRetracement(
  direction: 'BUY' | 'SELL',
  entryZone: number,
  subsequentCandles: Candle[]
): RetracementCheck {
  const maxCandles = STRATEGY_CONFIG.MAX_CANDLES_FOR_ENTRY;
  
  // Only check up to 10 candles (Rule 4)
  const candlesToCheck = subsequentCandles.slice(0, maxCandles);
  
  for (let i = 0; i < candlesToCheck.length; i++) {
    const candle = candlesToCheck[i];
    
    // Only check complete candles for entry
    if (!candle.complete) continue;
    
    if (direction === 'BUY') {
      // For BUY: Entry when price retraces DOWN to entry zone
      // Entry triggers when candle's low touches or goes below entry zone
      if (candle.low <= entryZone) {
        return {
          triggered: true,
          entryPrice: entryZone,
          triggerCandle: candle,
          candlesElapsed: i + 1,
        };
      }
    } else {
      // For SELL: Entry when price retraces UP to entry zone
      // Entry triggers when candle's high touches or goes above entry zone
      if (candle.high >= entryZone) {
        return {
          triggered: true,
          entryPrice: entryZone,
          triggerCandle: candle,
          candlesElapsed: i + 1,
        };
      }
    }
  }
  
  // No entry triggered yet
  return {
    triggered: false,
    entryPrice: null,
    triggerCandle: null,
    candlesElapsed: candlesToCheck.length,
  };
}

/**
 * Checks if a setup should be expired (10 candles passed without entry).
 * 
 * @param candlesElapsed - Number of candles since signal
 * @returns Whether the setup should be expired
 */
export function isSetupExpired(candlesElapsed: number): boolean {
  return candlesElapsed >= STRATEGY_CONFIG.MAX_CANDLES_FOR_ENTRY;
}

/**
 * Gets the remaining candles before expiration.
 * 
 * @param candlesElapsed - Number of candles since signal
 * @returns Candles remaining (0 = expired)
 */
export function getRemainingCandles(candlesElapsed: number): number {
  const remaining = STRATEGY_CONFIG.MAX_CANDLES_FOR_ENTRY - candlesElapsed;
  return Math.max(0, remaining);
}

/**
 * Calculates whether price is moving toward or away from entry zone.
 * Useful for UI progress indicators.
 * 
 * @param direction - Trade direction
 * @param entryZone - Entry price level
 * @param currentPrice - Current market price
 * @param previousPrice - Previous candle's close
 * @returns Movement status
 */
export function getMovementStatus(
  direction: 'BUY' | 'SELL',
  entryZone: number,
  currentPrice: number,
  previousPrice: number
): 'APPROACHING' | 'MOVING_AWAY' | 'AT_ZONE' {
  const tolerance = Math.abs(currentPrice - entryZone) / entryZone;
  
  // Consider "at zone" if within 0.01% (very close)
  if (tolerance < 0.0001) {
    return 'AT_ZONE';
  }
  
  if (direction === 'BUY') {
    // For BUY, we want price to come DOWN to entry
    const wasAbove = previousPrice > entryZone;
    const isAbove = currentPrice > entryZone;
    
    if (isAbove && currentPrice < previousPrice) {
      return 'APPROACHING';
    }
    return 'MOVING_AWAY';
  } else {
    // For SELL, we want price to go UP to entry
    const wasBelow = previousPrice < entryZone;
    const isBelow = currentPrice < entryZone;
    
    if (isBelow && currentPrice > previousPrice) {
      return 'APPROACHING';
    }
    return 'MOVING_AWAY';
  }
}

/**
 * Calculates distance to entry zone as a percentage.
 * 
 * @param entryZone - Entry price level
 * @param currentPrice - Current market price
 * @returns Distance as percentage (positive = needs to move)
 */
export function getDistancePercent(entryZone: number, currentPrice: number): number {
  return ((currentPrice - entryZone) / entryZone) * 100;
}

/**
 * Monitors multiple active setups against new candle data.
 * Returns setups that have been triggered or expired.
 * 
 * @param setups - Array of active setups to monitor
 * @param newCandle - The latest candle data
 * @returns Categorized results
 */
export function monitorSetups(
  setups: ActiveSetup[],
  newCandle: Candle
): {
  triggered: ActiveSetup[];
  expired: ActiveSetup[];
  stillActive: ActiveSetup[];
} {
  const triggered: ActiveSetup[] = [];
  const expired: ActiveSetup[] = [];
  const stillActive: ActiveSetup[] = [];
  
  for (const setup of setups) {
    // Skip if not waiting
    if (setup.status !== 'WAITING') continue;
    
    // Increment candle count
    const newCandlesElapsed = setup.candlesElapsed + 1;
    
    // Check for entry trigger
    let isTriggered = false;
    
    if (setup.direction === 'BUY') {
      isTriggered = newCandle.low <= setup.entryZone;
    } else {
      isTriggered = newCandle.high >= setup.entryZone;
    }
    
    if (isTriggered) {
      triggered.push({
        ...setup,
        candlesElapsed: newCandlesElapsed,
        status: 'TRIGGERED',
      });
    } else if (isSetupExpired(newCandlesElapsed)) {
      expired.push({
        ...setup,
        candlesElapsed: newCandlesElapsed,
        status: 'EXPIRED',
      });
    } else {
      stillActive.push({
        ...setup,
        candlesElapsed: newCandlesElapsed,
      });
    }
  }
  
  return { triggered, expired, stillActive };
}

/**
 * Creates an urgency level based on remaining candles.
 * Useful for UI styling/alerts.
 * 
 * @param candlesElapsed - Number of candles since signal
 * @returns Urgency level
 */
export function getUrgencyLevel(
  candlesElapsed: number
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const remaining = getRemainingCandles(candlesElapsed);
  
  if (remaining >= 7) return 'LOW';
  if (remaining >= 4) return 'MEDIUM';
  if (remaining >= 2) return 'HIGH';
  return 'CRITICAL';
}

/**
 * Formats the countdown display string.
 * 
 * @param candlesElapsed - Number of candles since signal
 * @returns Formatted countdown string
 */
export function formatCountdown(candlesElapsed: number): string {
  const remaining = getRemainingCandles(candlesElapsed);
  
  if (remaining === 0) {
    return 'EXPIRED';
  }
  
  return `${remaining}/${STRATEGY_CONFIG.MAX_CANDLES_FOR_ENTRY} candles remaining`;
}

/**
 * Checks if a setup is still valid (not expired and not triggered).
 * 
 * @param setup - Active setup to check
 * @returns Whether setup is still valid
 */
export function isSetupValid(setup: ActiveSetup): boolean {
  return setup.status === 'WAITING' && !isSetupExpired(setup.candlesElapsed);
}

/**
 * Simulates retracement checking on historical data.
 * Useful for backtesting.
 * 
 * @param signalCandle - The no-wick signal candle
 * @param direction - Trade direction
 * @param entryZone - Entry price level
 * @param subsequentCandles - All candles after signal
 * @returns Full simulation result
 */
export function simulateRetracement(
  signalCandle: Candle,
  direction: 'BUY' | 'SELL',
  entryZone: number,
  subsequentCandles: Candle[]
): {
  entryTriggered: boolean;
  entryCandle: Candle | null;
  candlesToEntry: number;
  expired: boolean;
} {
  const result = checkRetracement(direction, entryZone, subsequentCandles);
  
  return {
    entryTriggered: result.triggered,
    entryCandle: result.triggerCandle,
    candlesToEntry: result.candlesElapsed,
    expired: !result.triggered && result.candlesElapsed >= STRATEGY_CONFIG.MAX_CANDLES_FOR_ENTRY,
  };
}
