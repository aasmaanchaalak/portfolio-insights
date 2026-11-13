import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../../lib/authMiddleware';
import { canViewFo } from '../../../lib/fo/access';
import { getMarketData, isStale, refreshMarketData } from '../../../lib/fo/market';

// GET: stored NSE market positioning (participant OI, breadth, MTF).
// ?refresh=1 fetches missing days first (throttled to once an hour); the page
// calls it only when a plain GET says `stale`.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!canViewFo(authUser(req))) return res.status(403).json({ error: 'Forbidden' });
  try {
    let data = await getMarketData();
    if (req.query.refresh === '1' && isStale(data)) data = (await refreshMarketData()).data;
    res.status(200).json({ ...data, stale: isStale(data) });
  } catch (error) {
    console.error('F&O market data error:', error);
    res.status(500).json({ error: 'Failed to load market data' });
  }
}

export default withAuth(handler);
