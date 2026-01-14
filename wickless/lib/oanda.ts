// =============================================================================
// WICKLESS STRATEGY — OANDA API CLIENT
// =============================================================================
// Fetches candle data from OANDA REST API
// Uses the same proxy pattern as SweepSignal
// =============================================================================

import { Candle, OandaCandleResponse, Pair, Timeframe } from '../types/types';
import { OANDA_CONFIG, TIMEFRAME_CONFIGS, STRATEGY_CONFIG } from './config';

/**
 * Converts OANDA API response to our Candle format
 */
function parseOandaCandles(response: OandaCandleResponse): Candle[] {
  return response.candles.map(c => ({
    time: c.time,
    open: parseFloat(c.mid.o),
    high: parseFloat(c.mid.h),
    low: parseFloat(c.mid.l),
    close: parseFloat(c.mid.c),
    volume: c.volume,
    complete: c.complete,
  }));
}

/**
 * Fetches candles from OANDA API
 * 
 * @param pair - Trading pair (e.g., 'EUR_USD')
 * @param timeframe - Timeframe (e.g., 'M15')
 * @param count - Number of candles to fetch
 * @returns Array of Candle objects
 */
export async function fetchCandles(
  pair: Pair,
  timeframe: Timeframe,
  count: number = STRATEGY_CONFIG.CANDLES_TO_FETCH
): Promise<Candle[]> {
  const granularity = TIMEFRAME_CONFIGS[timeframe].oandaGranularity;
  
  const url = `${OANDA_CONFIG.API_URL}/v3/instruments/${pair}/candles?granularity=${granularity}&count=${count}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${OANDA_CONFIG.API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`OANDA API error: ${response.status} ${response.statusText}`);
  }

  const data: OandaCandleResponse = await response.json();
  return parseOandaCandles(data);
}

/**
 * Fetches candles via proxy server (for browser-based apps)
 * Use this when calling from frontend to avoid CORS issues
 * 
 * @param proxyUrl - URL of your proxy server
 * @param pair - Trading pair
 * @param timeframe - Timeframe
 * @param count - Number of candles
 * @returns Array of Candle objects
 */
export async function fetchCandlesViaProxy(
  proxyUrl: string,
  pair: Pair,
  timeframe: Timeframe,
  count: number = STRATEGY_CONFIG.CANDLES_TO_FETCH
): Promise<Candle[]> {
  const granularity = TIMEFRAME_CONFIGS[timeframe].oandaGranularity;
  
  const url = `${proxyUrl}/candles?instrument=${pair}&granularity=${granularity}&count=${count}`;
  
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Proxy error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // Handle both direct OANDA format and proxy-wrapped format
  if (data.candles) {
    return parseOandaCandles(data);
  }
  
  // If proxy returns pre-parsed data
  return data;
}

/**
 * Gets the latest complete candle
 * 
 * @param candles - Array of candles
 * @returns Most recent complete candle or null
 */
export function getLatestCompleteCandle(candles: Candle[]): Candle | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].complete) {
      return candles[i];
    }
  }
  return null;
}

/**
 * Gets the current (incomplete) candle
 * 
 * @param candles - Array of candles
 * @returns Current incomplete candle or null
 */
export function getCurrentCandle(candles: Candle[]): Candle | null {
  const latest = candles[candles.length - 1];
  return latest && !latest.complete ? latest : null;
}

/**
 * Gets only complete candles (filters out incomplete)
 * 
 * @param candles - Array of candles
 * @returns Array of complete candles only
 */
export function getCompleteCandles(candles: Candle[]): Candle[] {
  return candles.filter(c => c.complete);
}

/**
 * Gets candles after a specific time
 * 
 * @param candles - Array of candles
 * @param afterTime - ISO timestamp
 * @returns Candles after the specified time
 */
export function getCandlesAfter(candles: Candle[], afterTime: string): Candle[] {
  const afterDate = new Date(afterTime).getTime();
  return candles.filter(c => new Date(c.time).getTime() > afterDate);
}

/**
 * Gets the current market price (close of latest candle)
 * 
 * @param candles - Array of candles
 * @returns Current price or null
 */
export function getCurrentPrice(candles: Candle[]): number | null {
  const latest = candles[candles.length - 1];
  return latest ? latest.close : null;
}

/**
 * Fetches candles for multiple pairs
 * 
 * @param pairs - Array of trading pairs
 * @param timeframe - Timeframe
 * @param count - Number of candles per pair
 * @returns Map of pair to candles
 */
export async function fetchMultiplePairs(
  pairs: Pair[],
  timeframe: Timeframe,
  count: number = STRATEGY_CONFIG.CANDLES_TO_FETCH
): Promise<Map<Pair, Candle[]>> {
  const results = new Map<Pair, Candle[]>();
  
  // Fetch in parallel
  const promises = pairs.map(async pair => {
    try {
      const candles = await fetchCandles(pair, timeframe, count);
      results.set(pair, candles);
    } catch (error) {
      console.error(`Failed to fetch ${pair}:`, error);
      results.set(pair, []);
    }
  });
  
  await Promise.all(promises);
  return results;
}

/**
 * Fetches candles for multiple pairs via proxy
 * 
 * @param proxyUrl - Proxy server URL
 * @param pairs - Array of trading pairs
 * @param timeframe - Timeframe
 * @param count - Number of candles per pair
 * @returns Map of pair to candles
 */
export async function fetchMultiplePairsViaProxy(
  proxyUrl: string,
  pairs: Pair[],
  timeframe: Timeframe,
  count: number = STRATEGY_CONFIG.CANDLES_TO_FETCH
): Promise<Map<Pair, Candle[]>> {
  const results = new Map<Pair, Candle[]>();
  
  const promises = pairs.map(async pair => {
    try {
      const candles = await fetchCandlesViaProxy(proxyUrl, pair, timeframe, count);
      results.set(pair, candles);
    } catch (error) {
      console.error(`Failed to fetch ${pair}:`, error);
      results.set(pair, []);
    }
  });
  
  await Promise.all(promises);
  return results;
}

/**
 * Validates that we have enough candles for analysis
 * 
 * @param candles - Array of candles
 * @param minRequired - Minimum candles needed
 * @returns Whether we have enough data
 */
export function hasEnoughCandles(
  candles: Candle[],
  minRequired: number = STRATEGY_CONFIG.CANDLES_TO_FETCH / 2
): boolean {
  const complete = getCompleteCandles(candles);
  return complete.length >= minRequired;
}

/**
 * Gets candle at a specific index from the end
 * Negative index: -1 = last, -2 = second to last, etc.
 * 
 * @param candles - Array of candles
 * @param index - Index from end (negative)
 * @returns Candle at index or null
 */
export function getCandleFromEnd(candles: Candle[], index: number): Candle | null {
  const complete = getCompleteCandles(candles);
  const actualIndex = complete.length + index;
  return actualIndex >= 0 ? complete[actualIndex] : null;
}

/**
 * Calculates time until next candle close
 * 
 * @param timeframe - Current timeframe
 * @returns Milliseconds until next close
 */
export function getTimeUntilNextClose(timeframe: Timeframe): number {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ms = now.getMilliseconds();
  
  let intervalMinutes: number;
  
  switch (timeframe) {
    case 'M15':
      intervalMinutes = 15;
      break;
    case 'M30':
      intervalMinutes = 30;
      break;
    case 'H1':
      intervalMinutes = 60;
      break;
    case 'H4':
      intervalMinutes = 240;
      break;
    default:
      intervalMinutes = 15;
  }
  
  const minutesIntoInterval = minutes % intervalMinutes;
  const minutesRemaining = intervalMinutes - minutesIntoInterval - 1;
  const secondsRemaining = 60 - seconds;
  const msRemaining = 1000 - ms;
  
  return (minutesRemaining * 60 * 1000) + (secondsRemaining * 1000) + msRemaining;
}

/**
 * Formats candle time for display
 * 
 * @param candle - Candle object
 * @returns Formatted time string
 */
export function formatCandleTime(candle: Candle): string {
  const date = new Date(candle.time);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
