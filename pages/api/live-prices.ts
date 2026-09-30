import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../lib/authMiddleware';
import {
  getGridKeyData,
  getAnalystOverrides,
  isVisibleToAnalyst,
} from '../../lib/queries';
import { LiveQuote } from '../../lib/livePrices';
import { getCachedPrices, isFresh, refreshPrices } from '../../lib/livePriceCache';

// Stale-while-revalidate: a plain GET always answers straight from the cache
// (flagging `stale` when it's old), so the app never waits on Yahoo/BSE. The
// app then calls ?refresh=1 in the background, which does the slow fetch.

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const isAnalyst = authUser(req).role === 'analyst';
    const [gridKey, cached, overrides] = await Promise.all([
      getGridKeyData(),
      getCachedPrices(),
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
