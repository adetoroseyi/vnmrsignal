// =============================================================================
// WICKLESS STRATEGY — DETECTION MODULE EXPORTS
// =============================================================================

// Wickless candle detection
export {
  detectWickless,
  scanForWicklessCandles,
  getMostRecentWickless,
  analyzeWicks,
  validateWicklessCandle,
} from './wickless';

// Swing point detection
export {
  findSwingPoints,
  findSwingHighs,
  findSwingLows,
  getMostRecentSwingHigh,
  getMostRecentSwingLow,
  getLastNSwings,
  isHigherHigh,
  isHigherLow,
  isLowerHigh,
  isLowerLow,
  getSwingRelationships,
  getStructureForSL,
  hasEnoughSwingPoints,
  formatSwingPoints,
} from './swingPoints';

// Trend classification
export {
  classifyTrend,
  analyzeTrend,
  isTrendTradeable,
  getTrendDescription,
  calculateTrendStrength,
  isTrendAligned,
  getAllowedDirection,
  formatTrendAnalysis,
  detectTrendChangeWarning,
} from './trend';

// Structure-based SL/TP calculation
export {
  calculateTradeSetup,
  validateSetup,
  calculatePositionSize,
  formatTradeSetup,
  checkOutcome,
  checkEntryTrigger,
  distanceToEntry,
  createSetupSummary,
  adjustForSpread,
} from './structure';
