// =============================================================================
// WICKLESS STRATEGY — SIGNAL MANAGER
// =============================================================================
// Manages the lifecycle of detected signals:
// - Creates active setups from scan results
// - Monitors for retracement entries
// - Expires setups after 10 candles
// - Tracks triggered entries and outcomes
// =============================================================================

import { 
  ActiveSetup, 
  Signal, 
  Candle, 
  Pair, 
  Timeframe,
  SetupStatus,
  SignalOutcome,
  TradeSetup
} from '../../types/types';

import { STRATEGY_CONFIG } from '../config';
import { DetailedScanResult } from './scanner';
import { 
  checkRetracement, 
  isSetupExpired, 
  getRemainingCandles,
  getUrgencyLevel,
  monitorSetups 
} from './retracement';
import { checkOutcome } from '../detection/structure';

// -----------------------------------------------------------------------------
// Setup Creation
// -----------------------------------------------------------------------------

/**
 * Generates a unique ID for setups
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates an ActiveSetup from a scan result
 * 
 * @param scanResult - The scan result with detected signal
 * @returns ActiveSetup object ready for storage
 */
export function createActiveSetup(scanResult: DetailedScanResult): ActiveSetup | null {
  if (!scanResult.wicklessDetected || !scanResult.wicklessCandle || !scanResult.setup) {
    return null;
  }

  const candle = scanResult.wicklessCandle;
  const setup = scanResult.setup;

  return {
    id: generateId(),
    pair: scanResult.pair,
    timeframe: scanResult.timeframe,
    direction: setup.direction,
    signalCandleTime: candle.time,
    signalCandleOpen: candle.open,
    signalCandleHigh: candle.high,
    signalCandleLow: candle.low,
    signalCandleClose: candle.close,
    entryZone: setup.entryZone,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    candlesElapsed: 0,
    status: 'WAITING',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Creates a Signal (triggered entry) from an ActiveSetup
 * 
 * @param setup - The active setup that was triggered
 * @param entryTime - Time of entry
 * @returns Signal object ready for storage
 */
export function createSignal(setup: ActiveSetup, entryTime: string): Signal {
  return {
    id: generateId(),
    setupId: setup.id,
    pair: setup.pair,
    timeframe: setup.timeframe,
    direction: setup.direction,
    entryPrice: setup.entryZone,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    entryTime,
    outcome: null,
    outcomeTime: null,
    createdAt: new Date().toISOString(),
  };
}

// -----------------------------------------------------------------------------
// In-Memory Manager (for simple deployments)
// -----------------------------------------------------------------------------

export class SignalManager {
  private activeSetups: Map<string, ActiveSetup> = new Map();
  private triggeredSignals: Map<string, Signal> = new Map();
  private expiredSetups: ActiveSetup[] = [];
  private completedSignals: Signal[] = [];

  /**
   * Adds a new active setup
   */
  addSetup(setup: ActiveSetup): void {
    this.activeSetups.set(setup.id, setup);
  }

  /**
   * Gets all active setups
   */
  getActiveSetups(): ActiveSetup[] {
    return Array.from(this.activeSetups.values());
  }

  /**
   * Gets active setups for a specific pair
   */
  getSetupsForPair(pair: Pair): ActiveSetup[] {
    return this.getActiveSetups().filter(s => s.pair === pair);
  }

  /**
   * Gets active setups for a specific timeframe
   */
  getSetupsForTimeframe(timeframe: Timeframe): ActiveSetup[] {
    return this.getActiveSetups().filter(s => s.timeframe === timeframe);
  }

  /**
   * Gets all triggered (open) signals
   */
  getTriggeredSignals(): Signal[] {
    return Array.from(this.triggeredSignals.values());
  }

  /**
   * Gets all completed signals (with outcomes)
   */
  getCompletedSignals(): Signal[] {
    return this.completedSignals;
  }

  /**
   * Gets all expired setups
   */
  getExpiredSetups(): ActiveSetup[] {
    return this.expiredSetups;
  }

  /**
   * Processes a new candle for all active setups of a pair/timeframe
   * Returns triggered entries and expired setups
   */
  processNewCandle(
    pair: Pair,
    timeframe: Timeframe,
    candle: Candle
  ): {
    triggered: Signal[];
    expired: ActiveSetup[];
    stillActive: ActiveSetup[];
  } {
    const relevantSetups = this.getActiveSetups().filter(
      s => s.pair === pair && s.timeframe === timeframe && s.status === 'WAITING'
    );

    const result = monitorSetups(relevantSetups, candle);
    const triggeredSignals: Signal[] = [];

    // Process triggered setups
    for (const setup of result.triggered) {
      // Update setup status
      setup.status = 'TRIGGERED';
      this.activeSetups.set(setup.id, setup);

      // Create signal
      const signal = createSignal(setup, candle.time);
      this.triggeredSignals.set(signal.id, signal);
      triggeredSignals.push(signal);

      // Remove from active setups
      this.activeSetups.delete(setup.id);
    }

    // Process expired setups
    for (const setup of result.expired) {
      setup.status = 'EXPIRED';
      this.expiredSetups.push(setup);
      this.activeSetups.delete(setup.id);
    }

    // Update candle counts for still active
    for (const setup of result.stillActive) {
      this.activeSetups.set(setup.id, setup);
    }

    return {
      triggered: triggeredSignals,
      expired: result.expired,
      stillActive: result.stillActive,
    };
  }

  /**
   * Checks outcomes for all triggered signals against a new candle
   */
  checkSignalOutcomes(
    pair: Pair,
    candle: Candle
  ): Signal[] {
    const closedSignals: Signal[] = [];
    const relevantSignals = this.getTriggeredSignals().filter(
      s => s.pair === pair && s.outcome === null
    );

    for (const signal of relevantSignals) {
      const outcome = checkOutcome(
        {
          direction: signal.direction,
          entryZone: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          riskPips: 0,
          structurePoint: { index: 0, time: '', price: 0, type: 'LOW' },
        },
        candle.high,
        candle.low
      );

      if (outcome !== 'OPEN') {
        signal.outcome = outcome as SignalOutcome;
        signal.outcomeTime = candle.time;
        
        // Move to completed
        this.completedSignals.push(signal);
        this.triggeredSignals.delete(signal.id);
        closedSignals.push(signal);
      }
    }

    return closedSignals;
  }

  /**
   * Checks if a setup already exists for this signal candle
   * Prevents duplicates
   */
  hasExistingSetup(pair: Pair, signalCandleTime: string): boolean {
    return this.getActiveSetups().some(
      s => s.pair === pair && s.signalCandleTime === signalCandleTime
    );
  }

  /**
   * Gets statistics
   */
  getStats(): {
    activeSetups: number;
    openSignals: number;
    completedSignals: number;
    expiredSetups: number;
    wins: number;
    losses: number;
    winRate: number;
  } {
    const wins = this.completedSignals.filter(s => s.outcome === 'WIN').length;
    const losses = this.completedSignals.filter(s => s.outcome === 'LOSS').length;
    const total = wins + losses;

    return {
      activeSetups: this.activeSetups.size,
      openSignals: this.triggeredSignals.size,
      completedSignals: this.completedSignals.length,
      expiredSetups: this.expiredSetups.length,
      wins,
      losses,
      winRate: total > 0 ? (wins / total) * 100 : 0,
    };
  }

  /**
   * Gets stats for a specific pair
   */
  getStatsForPair(pair: Pair): {
    wins: number;
    losses: number;
    expired: number;
    winRate: number;
  } {
    const pairSignals = this.completedSignals.filter(s => s.pair === pair);
    const wins = pairSignals.filter(s => s.outcome === 'WIN').length;
    const losses = pairSignals.filter(s => s.outcome === 'LOSS').length;
    const expired = this.expiredSetups.filter(s => s.pair === pair).length;
    const total = wins + losses;

    return {
      wins,
      losses,
      expired,
      winRate: total > 0 ? (wins / total) * 100 : 0,
    };
  }

  /**
   * Clears all data (reset)
   */
  clear(): void {
    this.activeSetups.clear();
    this.triggeredSignals.clear();
    this.expiredSetups = [];
    this.completedSignals = [];
  }

  /**
   * Exports all data for persistence
   */
  export(): {
    activeSetups: ActiveSetup[];
    triggeredSignals: Signal[];
    expiredSetups: ActiveSetup[];
    completedSignals: Signal[];
  } {
    return {
      activeSetups: this.getActiveSetups(),
      triggeredSignals: this.getTriggeredSignals(),
      expiredSetups: this.expiredSetups,
      completedSignals: this.completedSignals,
    };
  }

  /**
   * Imports data (restore from persistence)
   */
  import(data: {
    activeSetups?: ActiveSetup[];
    triggeredSignals?: Signal[];
    expiredSetups?: ActiveSetup[];
    completedSignals?: Signal[];
  }): void {
    if (data.activeSetups) {
      for (const setup of data.activeSetups) {
        this.activeSetups.set(setup.id, setup);
      }
    }
    if (data.triggeredSignals) {
      for (const signal of data.triggeredSignals) {
        this.triggeredSignals.set(signal.id, signal);
      }
    }
    if (data.expiredSetups) {
      this.expiredSetups = data.expiredSetups;
    }
    if (data.completedSignals) {
      this.completedSignals = data.completedSignals;
    }
  }
}

// -----------------------------------------------------------------------------
// Singleton Instance (optional)
// -----------------------------------------------------------------------------

let managerInstance: SignalManager | null = null;

export function getSignalManager(): SignalManager {
  if (!managerInstance) {
    managerInstance = new SignalManager();
  }
  return managerInstance;
}

export function resetSignalManager(): void {
  if (managerInstance) {
    managerInstance.clear();
  }
  managerInstance = null;
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Formats an active setup for display
 */
export function formatActiveSetup(setup: ActiveSetup): string {
  const remaining = getRemainingCandles(setup.candlesElapsed);
  const urgency = getUrgencyLevel(setup.candlesElapsed);
  const urgencyIcon = urgency === 'CRITICAL' ? '🔴' : urgency === 'HIGH' ? '🟠' : urgency === 'MEDIUM' ? '🟡' : '🟢';

  return [
    `${setup.direction === 'BUY' ? '🟢' : '🔴'} ${setup.pair} ${setup.direction}`,
    `Entry: ${setup.entryZone}`,
    `SL: ${setup.stopLoss} | TP: ${setup.takeProfit}`,
    `${urgencyIcon} ${remaining}/10 candles remaining`,
  ].join('\n');
}

/**
 * Formats a triggered signal for display
 */
export function formatSignal(signal: Signal): string {
  const statusIcon = signal.outcome === 'WIN' ? '✅' : signal.outcome === 'LOSS' ? '❌' : '⏳';
  
  return [
    `${statusIcon} ${signal.pair} ${signal.direction}`,
    `Entry: ${signal.entryPrice} @ ${signal.entryTime}`,
    `SL: ${signal.stopLoss} | TP: ${signal.takeProfit}`,
    signal.outcome ? `Outcome: ${signal.outcome}` : 'Status: OPEN',
  ].join('\n');
}
