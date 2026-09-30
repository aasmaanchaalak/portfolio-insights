import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import {
  getGridKeyData,
  getUserByEmail,
  getAnalystOverrides,
  isVisibleToAnalyst,
  getCache,
  setCache,
} from '../../lib/queries';
import { fetchHoldingQuote, isIndianMarketOpen, mapWithLimit, LiveQuote } from '../../lib/livePrices';

const CACHE_KEY = 'live-prices:v1';
const TTL_OPEN_SECONDS = 45;         // shared across users so polling tabs don't multiply Yahoo calls
const TTL_CLOSED_SECONDS = 30 * 60;  // prices don't move after the close

interface LivePricesPayload {
  asOf: string;
  marketOpen: boolean;
  prices: Record<string, LiveQuote>; // keyed by lower-cased NSE code or BSE code
}

async function loadPrices(holdings: any[]): Promise<LivePricesPayload> {
  const cached = await getCache<LivePricesPayload>(CACHE_KEY);
  if (cached) return cached;

  const quotes = await mapWithLimit(holdings, 8, h => fetchHoldingQuote(h.nseCode || null, h.bseCode || null));
  const prices: Record<string, LiveQuote> = {};
  holdings.forEach((h, i) => {
    const q = quotes[i];
    if (!q) return;
    if (h.nseCode) prices[String(h.nseCode).toLowerCase()] = q;
    if (h.bseCode) prices[String(h.bseCode).toLowerCase()] = q;
  });

  const marketOpen = isIndianMarketOpen();
  const payload: LivePricesPayload = { asOf: new Date().toISOString(), marketOpen, prices };
  await setCache(CACHE_KEY, payload, marketOpen ? TTL_OPEN_SECONDS : TTL_CLOSED_SECONDS);
  return payload;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const holdings = ((await getGridKeyData()) || []).filter((h: any) => h.nseCode || h.bseCode);
    const payload = await loadPrices(holdings);

    // Analysts only get quotes for the holdings they're allowed to see.
    const userEmail = (req as any).user?.email;
    const user = userEmail ? await getUserByEmail(userEmail) : null;
    if (user?.role === 'analyst') {
      const overrides = await getAnalystOverrides();
      const allowed = new Set<string>();
      for (const h of holdings) {
        const invested = (Number(h.quantity) || 0) * (Number(h.averageBuyPrice) || 0);
        if (!isVisibleToAnalyst(invested, h.nseCode || h.bseCode, overrides)) continue;
        if (h.nseCode) allowed.add(String(h.nseCode).toLowerCase());
        if (h.bseCode) allowed.add(String(h.bseCode).toLowerCase());
      }
      const prices: Record<string, LiveQuote> = {};
      for (const [code, q] of Object.entries(payload.prices)) if (allowed.has(code)) prices[code] = q;
      return res.status(200).json({ ...payload, prices });
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Live prices error:', error);
    return res.status(500).json({ error: 'Failed to fetch live prices' });
  }
}

export default withAuth(handler);
