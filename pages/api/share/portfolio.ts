import { NextApiRequest, NextApiResponse } from 'next';
import { getGridKeyData, getPortfolioData } from '../../../lib/queries';

// Public "share" endpoint: returns per-holding name, NSE/BSE tickers, average
// buy price, weightage (% of total portfolio value), position as % of the
// company's market cap, and industry / industry group. Deliberately excludes
// quantity and absolute portfolio amounts so total portfolio size isn't exposed.
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

    // Map stock code -> portfolio stock, matching the app's join logic.
    const stockByCode = new Map<string, any>();
    for (const s of stocks) {
      if (s.nseCode) stockByCode.set(String(s.nseCode).toLowerCase(), s);
      if (s.bseCode) stockByCode.set(String(s.bseCode).toLowerCase(), s);
    }

    const lookup = (item: any) =>
      (item.nseCode ? stockByCode.get(String(item.nseCode).toLowerCase()) : undefined) ??
      (item.bseCode ? stockByCode.get(String(item.bseCode).toLowerCase()) : undefined);

    // Current value per holding = quantity × current price.
    const valued = holdings.map((item: any) => {
      const stock = lookup(item) || {};
      const currentPrice = stock.currentPrice != null ? Number(stock.currentPrice) : null;
      const qty = item.quantity != null ? Number(item.quantity) : null;
      const currentAmount = qty != null && currentPrice != null ? qty * currentPrice : 0;
      const name = item.scripName || stock.name || item.nseCode || item.bseCode || 'Unknown';
      const avgBuyPrice = item.averageBuyPrice != null ? Number(item.averageBuyPrice) : null;

      // Position as % of the company's market cap. marketCap is stored in ₹ crore
      // while currentAmount is in ₹, so convert crore → ₹ (×1e7) before dividing.
      const marketCapCr = stock.marketCap != null ? Number(stock.marketCap) : null;
      const positionPctOfMarketCap = marketCapCr != null && marketCapCr > 0
        ? Number(((currentAmount / (marketCapCr * 1e7)) * 100).toFixed(4))
        : null;

      return {
        name,
        nseCode: item.nseCode || null,
        bseCode: item.bseCode || null,
        avgBuyPrice,
        positionPctOfMarketCap,
        industry: stock.industry || null,
        industryGroup: stock.industryGroup || null,
        currentAmount,
      };
    });

    const totalValue = valued.reduce((sum, h) => sum + h.currentAmount, 0);

    const portfolio = valued
      .filter(h => h.currentAmount > 0)
      .map(h => ({
        name: h.name,
        nseCode: h.nseCode,
        bseCode: h.bseCode,
        avgBuyPrice: h.avgBuyPrice,
        weightage: totalValue > 0 ? Number(((h.currentAmount / totalValue) * 100).toFixed(2)) : 0,
        positionPctOfMarketCap: h.positionPctOfMarketCap,
        industry: h.industry,
        industryGroup: h.industryGroup,
      }))
      .sort((a, b) => b.weightage - a.weightage);

    return res.status(200).json({ holdings: portfolio, count: portfolio.length });
  } catch (error) {
    console.error('Error building share portfolio:', error);
    return res.status(500).json({ error: 'Failed to build portfolio data' });
  }
}

export default handler;
