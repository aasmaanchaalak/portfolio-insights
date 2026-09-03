import { NextApiRequest, NextApiResponse } from 'next';
import { getGridKeyData, getPortfolioData } from '../../../lib/queries';

// Public "share" endpoint: returns each holding's name and its weightage as a
// percentage of the total portfolio value. Deliberately excludes cost basis,
// quantity, and absolute amounts so the payload is safe to share externally.
//
// Auth: a static API key. Set SHARE_API_KEY in the environment and pass it as
// the `x-api-key` header (or `?key=` query param). Requests without a matching
// key get 401. If SHARE_API_KEY is unset, the endpoint is disabled (503) rather
// than silently public.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const expectedKey = process.env.SHARE_API_KEY;
  if (!expectedKey) {
    return res.status(503).json({ error: 'Share API is not configured' });
  }

  const providedKey = (req.headers['x-api-key'] as string) || (req.query.key as string) || '';
  if (providedKey !== expectedKey) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  try {
    const [gridKeyData, portfolioData] = await Promise.all([
      getGridKeyData(),
      getPortfolioData(),
    ]);

    const holdings = gridKeyData || [];
    const stocks = portfolioData || [];

    // Map stock code -> current price, matching the app's join logic.
    const priceByCode = new Map<string, number>();
    const nameByCode = new Map<string, string>();
    for (const s of stocks) {
      const price = s.currentPrice != null ? Number(s.currentPrice) : null;
      if (s.nseCode) {
        if (price != null) priceByCode.set(String(s.nseCode).toLowerCase(), price);
        if (s.name) nameByCode.set(String(s.nseCode).toLowerCase(), s.name);
      }
      if (s.bseCode) {
        if (price != null) priceByCode.set(String(s.bseCode).toLowerCase(), price);
        if (s.name) nameByCode.set(String(s.bseCode).toLowerCase(), s.name);
      }
    }

    const lookup = (item: any, map: Map<string, any>) =>
      (item.nseCode ? map.get(String(item.nseCode).toLowerCase()) : undefined) ??
      (item.bseCode ? map.get(String(item.bseCode).toLowerCase()) : undefined);

    // Current value per holding = quantity × current price.
    const valued = holdings.map((item: any) => {
      const currentPrice = lookup(item, priceByCode) ?? null;
      const qty = item.quantity != null ? Number(item.quantity) : null;
      const currentAmount = qty != null && currentPrice != null ? qty * currentPrice : 0;
      const name = item.scripName || lookup(item, nameByCode) || item.nseCode || item.bseCode || 'Unknown';
      return { name, nseCode: item.nseCode || null, bseCode: item.bseCode || null, currentAmount };
    });

    const totalValue = valued.reduce((sum, h) => sum + h.currentAmount, 0);

    const portfolio = valued
      .filter(h => h.currentAmount > 0)
      .map(h => ({
        name: h.name,
        nseCode: h.nseCode,
        bseCode: h.bseCode,
        weightage: totalValue > 0 ? Number(((h.currentAmount / totalValue) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.weightage - a.weightage);

    return res.status(200).json({ holdings: portfolio, count: portfolio.length });
  } catch (error) {
    console.error('Error building share portfolio:', error);
    return res.status(500).json({ error: 'Failed to build portfolio data' });
  }
}

export default handler;
