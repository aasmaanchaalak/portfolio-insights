import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { getPriceCached, upsertPriceCache } from '../../../lib/pipeline/queries';
import { fetchLivePrice } from '../../../lib/pipeline/price';

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
    // Always try live first to get company name; fall back to cache if live fails
    const live = await fetchLivePrice(tickerUpper);
    if (live) {
      await upsertPriceCache(tickerUpper, live.closePrice, live.priceDate);
      return res.status(200).json({ price: live });
    }

    // Live failed — return cached price (no company name available)
    const cached = await getPriceCached(tickerUpper);
    if (cached) return res.status(200).json({ price: { ...cached, companyName: null } });

    return res.status(200).json({ price: null });
  } catch (error) {
    console.error('Price lookup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
