import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getPortfolioData } from '../../../../lib/queries';
import { fetchScreenerCompany } from '../../../../lib/pipeline/screener';

// GET → { sharesCr, marketCapCr, price, source } — today's price (for the
// Forward Metrics IRR row) and suggested shares outstanding (in crore) = market
// cap (₹ Cr) ÷ price, used to pre-fill the Shares row. Uploaded Screener data first; stocks not in it (e.g. pipeline
// ideas) fall back to the live Screener page.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { stockCode } = req.query;
  if (!stockCode || typeof stockCode !== 'string') {
    return res.status(400).json({ error: 'Stock code is required' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const code = stockCode.trim().toLowerCase();
  let marketCapCr: number | null = null;
  let price: number | null = null;
  let source: 'screener-upload' | 'screener-live' | null = null;
  const pos = (v: unknown) => (Number(v) > 0 ? Number(v) : null);

  try {
    const stocks = (await getPortfolioData()) || [];
    const stock = stocks.find((s: any) =>
      String(s.nseCode || '').toLowerCase() === code || String(s.bseCode || '').toLowerCase() === code);
    if (stock) {
      price = pos(stock.currentPrice);
      marketCapCr = pos(stock.marketCap);
      if (price) source = 'screener-upload';
    }
    if (price == null || marketCapCr == null) {
      const live = await fetchScreenerCompany(stockCode.trim());
      if (live?.price) {
        price = price ?? live.price;
        marketCapCr = marketCapCr ?? live.marketCapCr;
        source = source ?? 'screener-live';
      }
    }
  } catch (error) {
    console.error('Shares suggestion error:', error);
  }

  const raw = marketCapCr != null && price != null ? marketCapCr / price : null;
  // Two decimals, or three for small share counts (under 10 Cr).
  const sharesCr = raw != null ? Number(raw.toFixed(raw < 10 ? 3 : 2)) : null;
  return res.status(200).json({ sharesCr, marketCapCr, price, source });
}

export default withAuth(handler);
