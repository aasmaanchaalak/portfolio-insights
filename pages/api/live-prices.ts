import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../lib/authMiddleware';
import {
  getGridKeyData,
  getAnalystOverrides,
  isVisibleToAnalyst,
  getCache,
  setCache,
} from '../../lib/queries';
import { fetchHoldingQuote, isIndianMarketOpen, mapWithLimit, LiveQuote } from '../../lib/livePrices';

// Stale-while-revalidate: a plain GET always answers straight from the cache
// (flagging `stale` when it's old), so the app never waits on Yahoo/BSE. The
// app then calls ?refresh=1 in the background, which does the slow fetch.
const CACHE_KEY = 'live-prices:v2';
const FRESH_OPEN_MS = 9 * 60 * 1000;     // just under the app's 10-min poll
const FRESH_CLOSED_MS = 30 * 60 * 1000;  // prices don't move after the close
const KEEP_SECONDS = 7 * 24 * 60 * 60;   // keep the last snapshot to serve while refreshing
const BSE_SYMBOLS_KEY = 'live-prices:bse-symbols'; // BSE scrip code → scrip id, resolved via Screener once

interface LivePricesPayload {
  asOf: string;
  marketOpen: boolean;
  prices: Record<string, LiveQuote>; // keyed by lower-cased NSE code or BSE code
}

function isFresh(p: LivePricesPayload): boolean {
  const age = Date.now() - new Date(p.asOf).getTime();
  // A snapshot taken during the session goes stale at the close, so the
  // closing price replaces the last intraday one.
  if (!isIndianMarketOpen()) return !p.marketOpen && age < FRESH_CLOSED_MS;
  return age < FRESH_OPEN_MS;
}

async function fetchPrices(holdings: any[]): Promise<LivePricesPayload> {
  const bseSymbols = (await getCache<Record<string, string>>(BSE_SYMBOLS_KEY)) || {};
  const known = Object.keys(bseSymbols).length;
  const quotes = await mapWithLimit(holdings, 8, h => fetchHoldingQuote(h.nseCode || null, h.bseCode || null, bseSymbols));
  if (Object.keys(bseSymbols).length > known) await setCache(BSE_SYMBOLS_KEY, bseSymbols);
  const prices: Record<string, LiveQuote> = {};
  holdings.forEach((h, i) => {
    const q = quotes[i];
    if (!q) return;
    if (h.nseCode) prices[String(h.nseCode).toLowerCase()] = q;
    if (h.bseCode) prices[String(h.bseCode).toLowerCase()] = q;
  });
  const payload: LivePricesPayload = { asOf: new Date().toISOString(), marketOpen: isIndianMarketOpen(), prices };
  await setCache(CACHE_KEY, payload, KEEP_SECONDS);
  return payload;
}

// One fetch at a time per server instance, however many refreshes arrive.
let inflight: Promise<LivePricesPayload> | null = null;
function refreshPrices(holdings: any[]): Promise<LivePricesPayload> {
  if (!inflight) inflight = fetchPrices(holdings).finally(() => { inflight = null; });
  return inflight;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const isAnalyst = authUser(req).role === 'analyst';
    const [gridKey, cached, overrides] = await Promise.all([
      getGridKeyData(),
      getCache<LivePricesPayload>(CACHE_KEY),
      isAnalyst ? getAnalystOverrides() : Promise.resolve(null),
    ]);
    const holdings = (gridKey || []).filter((h: any) => h.nseCode || h.bseCode);

    let payload = cached;
    if (!payload || (req.query.refresh === '1' && !isFresh(payload))) {
      payload = await refreshPrices(holdings);
    }
    const stale = !isFresh(payload);

    // Analysts only get quotes for the holdings they're allowed to see.
    if (overrides) {
      const allowed = new Set<string>();
      for (const h of holdings) {
        const invested = (Number(h.quantity) || 0) * (Number(h.averageBuyPrice) || 0);
        if (!isVisibleToAnalyst(invested, h.nseCode || h.bseCode, overrides)) continue;
        if (h.nseCode) allowed.add(String(h.nseCode).toLowerCase());
        if (h.bseCode) allowed.add(String(h.bseCode).toLowerCase());
      }
      const prices: Record<string, LiveQuote> = {};
      for (const [code, q] of Object.entries(payload.prices)) if (allowed.has(code)) prices[code] = q;
      return res.status(200).json({ ...payload, prices, stale });
    }

    return res.status(200).json({ ...payload, stale });
  } catch (error) {
    console.error('Live prices error:', error);
    return res.status(500).json({ error: 'Failed to fetch live prices' });
  }
}

export default withAuth(handler);
