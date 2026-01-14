// =============================================================================
// WICKLESS STRATEGY — CRON API ROUTE
// =============================================================================
// GET /api/cron - Scheduled scan endpoint (called by Vercel Cron or external)
// 
// This endpoint:
// 1. Scans all pairs for new signals
// 2. Monitors active setups for retracement entries
// 3. Checks open signals for SL/TP hits
// 4. Expires setups older than 10 candles
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { scanMultiplePairs } from '../../lib/signals/scanner';
import { 
  createAndSaveSetup, 
  logScan, 
  getActiveSetups,
  getActiveSetupsFor,
  getOpenSignals,
  updateSetup,
  markSetupTriggered,
  markSetupExpired,
  saveSignal,
  updateSignalOutcome,
  expireOldSetups
} from '../../lib/supabase';
import { fetchCandlesViaProxy, getLatestCompleteCandle } from '../../lib/oanda';
import { checkOutcome } from '../../lib/detection/structure';
import { RECOMMENDED_PAIRS, TIMEFRAME_CONFIGS, isValidTimeframe } from '../../lib/config';
import { Pair, Timeframe, Signal } from '../../types/types';

// Proxy URL for OANDA API
const PROXY_URL = process.env.OANDA_PROXY_URL || '';

// Cron secret for authentication (optional but recommended)
const CRON_SECRET = process.env.CRON_SECRET || '';

/**
 * GET /api/cron
 * Main cron endpoint - runs the full scan and monitoring cycle
 * 
 * Query params:
 * - timeframe: 'M15' | 'M30' | 'H1' | 'H4' (default: M15)
 * - secret: authentication token (optional)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Verify cron secret if configured
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (CRON_SECRET && secret !== CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get timeframe from query or default
    const timeframeParam = searchParams.get('timeframe') || 'M15';
    if (!isValidTimeframe(timeframeParam)) {
      return NextResponse.json(
        { error: 'Invalid timeframe' },
        { status: 400 }
      );
    }
    const timeframe = timeframeParam as Timeframe;

    // Check proxy URL
    if (!PROXY_URL) {
      return NextResponse.json(
        { error: 'OANDA_PROXY_URL not configured' },
        { status: 500 }
      );
    }

    // Results tracking
    const results = {
      timestamp: new Date().toISOString(),
      timeframe,
      newSignals: 0,
      triggeredEntries: 0,
      expiredSetups: 0,
      closedSignals: { wins: 0, losses: 0 },
      errors: [] as string[],
    };

    // =========================================================================
    // STEP 1: Scan for new wickless signals
    // =========================================================================
    
    const scanResult = await scanMultiplePairs({
      pairs: RECOMMENDED_PAIRS,
      timeframe,
      proxyUrl: PROXY_URL,
    });

    // Save new setups
    for (const signal of scanResult.signalsFound) {
      try {
        const saved = await createAndSaveSetup(signal);
        if (saved) {
          results.newSignals++;
        }
      } catch (err) {
        results.errors.push(`Failed to save setup for ${signal.pair}: ${err}`);
      }
    }

    // Log the scan
    await logScan(
      RECOMMENDED_PAIRS,
      timeframe,
      scanResult.results,
      scanResult.totalDuration
    );

    // =========================================================================
    // STEP 2: Monitor active setups for retracement entries
    // =========================================================================
    
    const activeSetups = await getActiveSetups();
    
    for (const setup of activeSetups) {
      // Only process setups for current timeframe
      if (setup.timeframe !== timeframe) continue;
      
      try {
        // Fetch latest candle for this pair
        const candles = await fetchCandlesViaProxy(
          PROXY_URL, 
          setup.pair as Pair, 
          timeframe, 
          5
        );
        
        const latestCandle = getLatestCompleteCandle(candles);
        if (!latestCandle) continue;

        // Check for entry trigger
        let triggered = false;
        if (setup.direction === 'BUY') {
          triggered = latestCandle.low <= setup.entryZone;
        } else {
          triggered = latestCandle.high >= setup.entryZone;
        }

        if (triggered) {
          // Mark setup as triggered
          await markSetupTriggered(setup.id);
          
          // Create signal record
          const signal: Signal = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            setupId: setup.id,
            pair: setup.pair,
            timeframe: setup.timeframe,
            direction: setup.direction,
            entryPrice: setup.entryZone,
            stopLoss: setup.stopLoss,
            takeProfit: setup.takeProfit,
            entryTime: latestCandle.time,
            outcome: null,
            outcomeTime: null,
            createdAt: new Date().toISOString(),
          };
          
          await saveSignal(signal);
          results.triggeredEntries++;
        } else {
          // Increment candle count
          const newCount = setup.candlesElapsed + 1;
          
          if (newCount >= 10) {
            // Expire the setup
            await markSetupExpired(setup.id);
            results.expiredSetups++;
          } else {
            // Just update the count
            await updateSetup(setup.id, { candlesElapsed: newCount });
          }
        }
      } catch (err) {
        results.errors.push(`Error processing setup ${setup.id}: ${err}`);
      }
    }

    // =========================================================================
    // STEP 3: Check open signals for SL/TP hits
    // =========================================================================
    
    const openSignals = await getOpenSignals();
    
    for (const signal of openSignals) {
      // Only process signals for current timeframe
      if (signal.timeframe !== timeframe) continue;
      
      try {
        // Fetch latest candle
        const candles = await fetchCandlesViaProxy(
          PROXY_URL, 
          signal.pair as Pair, 
          timeframe, 
          5
        );
        
        const latestCandle = getLatestCompleteCandle(candles);
        if (!latestCandle) continue;

        // Check outcome
        const outcome = checkOutcome(
          {
            direction: signal.direction,
            entryZone: signal.entryPrice,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            riskPips: 0,
            structurePoint: { index: 0, time: '', price: 0, type: 'LOW' },
          },
          latestCandle.high,
          latestCandle.low
        );

        if (outcome !== 'OPEN') {
          // Determine outcome price
          let outcomePrice: number;
          if (outcome === 'WIN') {
            outcomePrice = signal.takeProfit;
          } else {
            outcomePrice = signal.stopLoss;
          }

          await updateSignalOutcome(
            signal.id,
            outcome as 'WIN' | 'LOSS',
            latestCandle.time,
            outcomePrice
          );

          if (outcome === 'WIN') {
            results.closedSignals.wins++;
          } else {
            results.closedSignals.losses++;
          }
        }
      } catch (err) {
        results.errors.push(`Error checking signal ${signal.id}: ${err}`);
      }
    }

    // =========================================================================
    // STEP 4: Clean up any old expired setups
    // =========================================================================
    
    const additionalExpired = await expireOldSetups();
    results.expiredSetups += additionalExpired;

    // =========================================================================
    // Return results
    // =========================================================================
    
    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      ...results,
      duration,
      summary: {
        scanned: RECOMMENDED_PAIRS.length,
        newSignals: results.newSignals,
        triggered: results.triggeredEntries,
        expired: results.expiredSetups,
        wins: results.closedSignals.wins,
        losses: results.closedSignals.losses,
      },
    });

  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json(
      { 
        error: 'Cron job failed', 
        details: String(error),
        duration: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request);
}
