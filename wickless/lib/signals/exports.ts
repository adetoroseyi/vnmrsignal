// =============================================================================
// WICKLESS STRATEGY — SIGNALS MODULE EXPORTS
// =============================================================================

// Scanner (main entry point)
export {
  scanPair,
  scanMultiplePairs,
  checkTrend,
  checkAllTrends,
  scanHistorical,
  summarizeScanResult,
  summarizeMultiScan,
  type ScanOptions,
  type DetailedScanResult,
  type MultiScanOptions,
  type MultiScanResult,
} from './scanner';

// Retracement monitoring
export {
  checkRetracement,
  isSetupExpired,
  getRemainingCandles,
  getMovementStatus,
  getDistancePercent,
  monitorSetups,
  getUrgencyLevel,
  formatCountdown,
  isSetupValid,
  simulateRetracement,
} from './retracement';

// Signal manager
export {
  createActiveSetup,
  createSignal,
  SignalManager,
  getSignalManager,
  resetSignalManager,
  formatActiveSetup,
  formatSignal,
} from './manager';
