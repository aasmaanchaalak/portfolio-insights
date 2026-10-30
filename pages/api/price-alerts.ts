import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../lib/authMiddleware';
import { getPriceAlerts, createPriceAlert, deletePriceAlert, PriceAlertDirection } from '../../lib/priceAlerts';
import { getCachedPrices } from '../../lib/livePriceCache';

// GET ?code=X → alerts for that stock (all alerts without a code).
// POST { code, targetPrice, note?, currentPrice? } → new alert. The direction
// comes from the latest live price (the client's price is the fallback).
// DELETE ?id=N → remove an alert.

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      return res.status(200).json(await getPriceAlerts(code));
    }

    if (req.method === 'POST') {
      const { code, targetPrice, note, currentPrice } = req.body || {};
      if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Stock code is required' });
      const target = Number(targetPrice);
      if (!(target > 0)) return res.status(400).json({ error: 'Target price must be a positive number' });

      const cached = await getCachedPrices();
      const livePrice = cached?.prices[code.toLowerCase()]?.price;
      const price = livePrice ?? (Number(currentPrice) > 0 ? Number(currentPrice) : null);
      if (price == null) return res.status(400).json({ error: 'No current price for this stock, so the alert direction is unknown' });
      if (target === price) return res.status(400).json({ error: 'Target equals the current price' });

      const direction: PriceAlertDirection = target > price ? 'above' : 'below';
      const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 200) : null;
      const alert = await createPriceAlert(code, target, direction, cleanNote, authUser(req).email);
      return res.status(200).json(alert);
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Alert id is required' });
      await deletePriceAlert(id);
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error('Price alerts error:', error);
    return res.status(500).json({ error: 'Price alert request failed' });
  }
}

export default withAuth(handler);
