// Shared live-price snapshot for all holdings, cached in the database.
// Used by /api/live-prices (the app) and /api/cron/alerts (notifications).

import { getCache, setCache } from './queries';
import { fetchHoldingQuote, isIndianMarketOpen, mapWithLimit, LiveQuote } from './livePrices';

const CACHE_KEY = 'live-prices:v2';
const FRESH_OPEN_MS = 9 * 60 * 1000;     // just under the app's 10-min poll
const FRESH_CLOSED_MS = 30 * 60 * 1000;  // prices don't move after the close
const KEEP_SECONDS = 7 * 24 * 60 * 60;   // keep the last snapshot to serve while refreshing
const BSE_SYMBOLS_KEY = 'live-prices:bse-symbols'; // BSE scrip code → scrip id, resolved via Screener once

export interface LivePricesPayload {
  asOf: string;
  marketOpen: boolean;
  prices: Record<string, LiveQuote>; // keyed by lower-cased NSE code or BSE code
}

export function isFresh(p: LivePricesPayload): boolean {
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
export function refreshPrices(holdings: any[]): Promise<LivePricesPayload> {
  if (!inflight) inflight = fetchPrices(holdings).finally(() => { inflight = null; });
  return inflight;
}

/** The cached snapshot as-is (null if none yet). */
export function getCachedPrices(): Promise<LivePricesPayload | null> {
  return getCache<LivePricesPayload>(CACHE_KEY);
}
