import { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqual } from 'crypto';
import { getGridKeyData } from '../../../lib/queries';
import { isIndianMarketOpen } from '../../../lib/livePrices';
import { getCachedPrices, isFresh, refreshPrices } from '../../../lib/livePriceCache';
import { evaluateAlerts, notifyAlerts } from '../../../lib/stockAlerts';

// Called every 10 minutes during market hours by .github/workflows/alerts.yml.
// Auth: "Authorization: Bearer <CRON_SECRET>" (no user session).
// ?dryRun=1 returns the events without sending or recording them;
// ?force=1 runs outside market hours.

function authorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const dryRun = req.query.dryRun === '1';
  if (!isIndianMarketOpen() && req.query.force !== '1') {
    return res.status(200).json({ skipped: 'market closed' });
  }

  try {
    let payload = await getCachedPrices();
    if (!payload || !isFresh(payload)) {
      const holdings = ((await getGridKeyData()) || []).filter((h: any) => h.nseCode || h.bseCode);
      payload = await refreshPrices(holdings);
    }
    const alerts = await evaluateAlerts(payload.prices, dryRun);
    const delivery = dryRun ? null : await notifyAlerts(alerts);
    return res.status(200).json({
      pricesAsOf: payload.asOf,
      alerts: alerts.map(a => ({ code: a.code, kind: a.kind, title: a.title, body: a.body })),
      delivery,
      dryRun,
    });
  } catch (error) {
    console.error('Alerts cron error:', error);
    return res.status(500).json({ error: 'Alert check failed' });
  }
}
