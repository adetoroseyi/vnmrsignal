// =============================================================================
// WICKLESS STRATEGY — SCAN API ROUTE
// =============================================================================
// POST /api/scan - Triggers a manual scan
// GET /api/scan - Gets latest scan status
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { scanMultiplePairs, summarizeMultiScan } from '../../lib/signals/scanner';
import { createAndSaveSetup, logScan, getActiveSetups } from '../../lib/supabase';
import { RECOMMENDED_PAIRS, isValidTimeframe } from '../../lib/config';
import { Pair, Timeframe } from '../../types/types';

// Proxy URL for OANDA API (set in environment)
const PROXY_URL = process.env.OANDA_PROXY_URL || '';

/**
 * POST /api/scan
 * Triggers a manual scan for all pairs or specific pairs
 * 
 * Body:
 * {
 *   timeframe: 'M15' | 'M30' | 'H1' | 'H4',
 *   pairs?: ['EUR_USD', 'GBP_USD', ...],
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { timeframe, pairs } = body;

    // Validate timeframe
    if (!timeframe || !isValidTimeframe(timeframe)) {
      return NextResponse.json(
        { error: 'Invalid timeframe. Must be M15, M30, H1, or H4' },
        { status: 400 }
      );
    }

    // Use provided pairs or defaults
    const pairsToScan: Pair[] = pairs && Array.isArray(pairs) 
      ? pairs 
      : RECOMMENDED_PAIRS;

    // Check proxy URL
    if (!PROXY_URL) {
      return NextResponse.json(
        { error: 'OANDA_PROXY_URL not configured' },
        { status: 500 }
      );
    }

    // Run the scan
    const scanResult = await scanMultiplePairs({
      pairs: pairsToScan,
      timeframe: timeframe as Timeframe,
      proxyUrl: PROXY_URL,
    });

    // Save any new setups to database
    const savedSetups = [];
    for (const signal of scanResult.signalsFound) {
      const saved = await createAndSaveSetup(signal);
      if (saved) {
        savedSetups.push(saved);
      }
    }

    // Log the scan
    await logScan(
      pairsToScan,
      timeframe as Timeframe,
      scanResult.results,
      scanResult.totalDuration
    );

    // Return results
    return NextResponse.json({
      success: true,
      timestamp: scanResult.timestamp,
      duration: scanResult.totalDuration,
      pairsScanned: pairsToScan.length,
      signalsFound: scanResult.signalsFound.length,
      newSetupsCreated: savedSetups.length,
      results: scanResult.results.map(r => ({
        pair: r.pair,
        trend: r.trend,
        wicklessDetected: r.wicklessDetected,
        setup: r.setup ? {
          direction: r.setup.direction,
          entryZone: r.setup.entryZone,
          stopLoss: r.setup.stopLoss,
          takeProfit: r.setup.takeProfit,
          riskPips: r.setup.riskPips,
        } : null,
        validation: r.setupValidation,
      })),
      summary: summarizeMultiScan(scanResult),
    });

  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { error: 'Scan failed', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/scan
 * Gets current active setups and recent scan info
 */
export async function GET(request: NextRequest) {
  try {
    const activeSetups = await getActiveSetups();

    return NextResponse.json({
      success: true,
      activeSetups: activeSetups.map(s => ({
        id: s.id,
        pair: s.pair,
        timeframe: s.timeframe,
        direction: s.direction,
        entryZone: s.entryZone,
        stopLoss: s.stopLoss,
        takeProfit: s.takeProfit,
        candlesElapsed: s.candlesElapsed,
        candlesRemaining: 10 - s.candlesElapsed,
        createdAt: s.createdAt,
      })),
      count: activeSetups.length,
    });

  } catch (error) {
    console.error('Get scan status error:', error);
    return NextResponse.json(
      { error: 'Failed to get scan status', details: String(error) },
      { status: 500 }
    );
  }
}
