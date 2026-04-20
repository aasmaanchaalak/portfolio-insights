import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { getPriceCached, upsertPriceCache } from '../../../lib/pipeline/queries';

async function fetchLivePrice(tickerWithSuffix: string): Promise<{ closePrice: number; priceDate: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tickerWithSuffix)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = result.timestamp ?? [];
    // Get latest non-null close
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) {
        const priceDate = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
        return { closePrice: Math.round(closes[i] * 100) / 100, priceDate };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { ticker } = req.query;
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'ticker is required (include exchange suffix, e.g. HDFCBANK.NS)' });
  }

  const tickerUpper = ticker.toUpperCase();

  try {
    // Try cache first
    const cached = await getPriceCached(tickerUpper);
    if (cached) return res.status(200).json({ price: cached });

    // Not in cache — try live Yahoo Finance
    const live = await fetchLivePrice(tickerUpper);
    if (live) {
      // Cache it for future use
      await upsertPriceCache(tickerUpper, live.closePrice, live.priceDate);
      return res.status(200).json({ price: live });
    }

    // Not found anywhere
    return res.status(200).json({ price: null });
  } catch (error) {
    console.error('Price lookup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
