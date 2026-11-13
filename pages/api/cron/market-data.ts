import { NextApiRequest, NextApiResponse } from 'next';
import { cronAuthorized } from '../../../lib/cronAuth';
import { refreshMarketData } from '../../../lib/fo/market';

// Called on weekday evenings by .github/workflows/market-data.yml: fetches
// NSE's participant OI, bhavcopy breadth and MTF disclosure for any day not
// stored yet (see lib/fo/market.ts). Auth: "Authorization: Bearer <CRON_SECRET>".
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { data, added, errors, remaining } = await refreshMarketData(true);
    const latest = (m: Record<string, unknown>) => Object.keys(m).sort().pop() ?? null;
    return res.status(200).json({
      added: added.length,
      remaining, // files still to try (the time budget ran out); call again to continue
      errors,
      latest: { oi: latest(data.oi), breadth: latest(data.breadth), mtf: latest(data.mtf) },
    });
  } catch (error) {
    console.error('Market data cron error:', error);
    return res.status(500).json({ error: 'Market data fetch failed' });
  }
}
