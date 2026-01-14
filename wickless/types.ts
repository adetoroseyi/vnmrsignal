// =============================================================================
// WICKLESS STRATEGY — TYPE DEFINITIONS
// =============================================================================

// -----------------------------------------------------------------------------
// OANDA Candle Data
// -----------------------------------------------------------------------------

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  complete: boolean;
}

export interface OandaCandleResponse {
  instrument: string;
  granularity: string;
  candles: {
    time: string;
    volume: number;
    complete: boolean;
    mid: {
      o: string;
      h: string;
      l: string;
      c: string;
    };
  }[];
}

// -----------------------------------------------------------------------------
// Swing Point Detection
// -----------------------------------------------------------------------------

export interface SwingPoint {
  index: number;
  time: string;
  price: number;
  type: 'HIGH' | 'LOW';
}

// -----------------------------------------------------------------------------
// Trend Classification
// -----------------------------------------------------------------------------

export type Trend = 'UP' | 'DOWN' | 'RANGING';

export interface TrendAnalysis {
  trend: Trend;
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  latestHH: SwingPoint | null;
  latestHL: SwingPoint | null;
  latestLH: SwingPoint | null;
  latestLL: SwingPoint | null;
}

// -----------------------------------------------------------------------------
// Wickless Candle Detection
// -----------------------------------------------------------------------------

export interface WicklessResult {
  isValid: boolean;
  direction: 'BUY' | 'SELL' | null;
  entryZone: number | null;
  candle: Candle | null;
}

// -----------------------------------------------------------------------------
// Trade Setup (SL/TP Calculation)
// -----------------------------------------------------------------------------

export interface TradeSetup {
  direction: 'BUY' | 'SELL';
  entryZone: number;
  stopLoss: number;
  takeProfit: number;
  riskPips: number;
  structurePoint: SwingPoint;
}

// -----------------------------------------------------------------------------
// Retracement Monitoring
// -----------------------------------------------------------------------------

export interface RetracementCheck {
  triggered: boolean;
  entryPrice: number | null;
  triggerCandle: Candle | null;
  candlesElapsed: number;
}

// -----------------------------------------------------------------------------
// Active Setup (Database Model)
// -----------------------------------------------------------------------------

export interface ActiveSetup {
  id: string;
  pair: string;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL';
  signalCandleTime: string;
  signalCandleOpen: number;
  signalCandleHigh: number;
  signalCandleLow: number;
  signalCandleClose: number;
  entryZone: number;
  stopLoss: number;
  takeProfit: number;
  candlesElapsed: number;
  status: SetupStatus;
  createdAt: string;
}

export type SetupStatus = 'WAITING' | 'TRIGGERED' | 'EXPIRED';

// -----------------------------------------------------------------------------
// Signal (Triggered Entry - Database Model)
// -----------------------------------------------------------------------------

export interface Signal {
  id: string;
  setupId: string;
  pair: string;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: string;
  outcome: SignalOutcome | null;
  outcomeTime: string | null;
  createdAt: string;
}

export type SignalOutcome = 'WIN' | 'LOSS';

// -----------------------------------------------------------------------------
// Configuration Types
// -----------------------------------------------------------------------------

export type Pair = 
  | 'EUR_USD' 
  | 'GBP_USD' 
  | 'AUD_USD' 
  | 'USD_JPY' 
  | 'XAU_USD';

export type Timeframe = 'M15' | 'M30' | 'H1' | 'H4';

export interface PairConfig {
  symbol: string;
  displayName: string;
  tolerance: number;
  slBuffer: number;
  pipMultiplier: number;
}

export interface TimeframeConfig {
  value: string;
  displayName: string;
  scanInterval: number;
  oandaGranularity: string;
}

// -----------------------------------------------------------------------------
// Scanner Types
// -----------------------------------------------------------------------------

export interface ScanResult {
  pair: Pair;
  timeframe: Timeframe;
  trend: Trend;
  wicklessDetected: boolean;
  wicklessCandle: Candle | null;
  setup: TradeSetup | null;
  timestamp: string;
}

export interface ScannerState {
  isScanning: boolean;
  lastScan: string | null;
  activePairs: Pair[];
  activeTimeframe: Timeframe;
  results: ScanResult[];
}

// -----------------------------------------------------------------------------
// Stats (Performance Tracking)
// -----------------------------------------------------------------------------

export interface PairStats {
  pair: Pair;
  timeframe: Timeframe;
  totalSignals: number;
  wins: number;
  losses: number;
  expired: number;
  winRate: number;
}

// -----------------------------------------------------------------------------
// API Response Types
// -----------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface ScanResponse {
  results: ScanResult[];
  newSetups: ActiveSetup[];
  triggeredEntries: Signal[];
  expiredSetups: string[];
}
