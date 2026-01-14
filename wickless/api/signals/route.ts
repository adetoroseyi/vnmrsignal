// =============================================================================
// WICKLESS STRATEGY — SIGNALS API ROUTE
// =============================================================================
// GET /api/signals - Gets signals (open, recent, or all)
// POST /api/signals - Updates signal outcome
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { 
  getOpenSignals, 
  getRecentSignals, 
  updateSignalOutcome,
  getAllStats,
  getStatsForPair,
  getActiveSetups
} from '../../lib/supabase';
import { isValidPair } from '../../lib/config';
import { Pair } from '../../types/types';

/**
 * GET /api/signals
 * Gets signals based on query params
 * 
 * Query params:
 * - type: 'open' | 'recent' | 'all' (default: 'recent')
 * - limit: number (default: 50)
 * - pair: filter by pair
 * - stats: 'true' to include stats
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'recent';
    const limit = parseInt(searchParams.get('limit') || '50');
    const pair = searchParams.get('pair');
    const includeStats = searchParams.get('stats') === 'true';

    let signals;
    
    switch (type) {
      case 'open':
        signals = await getOpenSignals();
        break;
      case 'recent':
      default:
        signals = await getRecentSignals(limit);
        break;
    }

    // Filter by pair if specified
    if (pair && isValidPair(pair)) {
      signals = signals.filter(s => s.pair === pair);
    }

    // Get stats if requested
    let stats = null;
    if (includeStats) {
      if (pair && isValidPair(pair)) {
        stats = await getStatsForPair(pair as Pair);
      } else {
        stats = await getAllStats();
      }
    }

    // Get active setups count
    const activeSetups = await getActiveSetups();

    return NextResponse.json({
      success: true,
      signals: signals.map(s => ({
        id: s.id,
        pair: s.pair,
        timeframe: s.timeframe,
        direction: s.direction,
        entryPrice: s.entryPrice,
        stopLoss: s.stopLoss,
        takeProfit: s.takeProfit,
        entryTime: s.entryTime,
        outcome: s.outcome,
        outcomeTime: s.outcomeTime,
      })),
      count: signals.length,
      activeSetups: activeSetups.length,
      stats,
    });

  } catch (error) {
    console.error('Get signals error:', error);
    return NextResponse.json(
      { error: 'Failed to get signals', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/signals
 * Updates a signal's outcome
 * 
 * Body:
 * {
 *   id: string,
 *   outcome: 'WIN' | 'LOSS',
 *   outcomeTime: string (ISO),
 *   outcomePrice?: number
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, outcome, outcomeTime, outcomePrice } = body;

    // Validate inputs
    if (!id) {
      return NextResponse.json(
        { error: 'Signal ID is required' },
        { status: 400 }
      );
    }

    if (!outcome || !['WIN', 'LOSS'].includes(outcome)) {
      return NextResponse.json(
        { error: 'Outcome must be WIN or LOSS' },
        { status: 400 }
      );
    }

    if (!outcomeTime) {
      return NextResponse.json(
        { error: 'Outcome time is required' },
        { status: 400 }
      );
    }

    // Update the signal
    const success = await updateSignalOutcome(
      id, 
      outcome, 
      outcomeTime, 
      outcomePrice
    );

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update signal' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Signal ${id} marked as ${outcome}`,
    });

  } catch (error) {
    console.error('Update signal error:', error);
    return NextResponse.json(
      { error: 'Failed to update signal', details: String(error) },
      { status: 500 }
    );
  }
}
