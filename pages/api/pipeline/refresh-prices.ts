import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { query } from '../../../lib/db';

async function fetchPrice(tickerWithSuffix: string): Promise<{ closePrice: number; companyName: string | null } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tickerWithSuffix)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const companyName: string | null = result.meta?.longName || result.meta?.shortName || null;
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = result.timestamp ?? [];
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) {
        const priceDate = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
        return { closePrice: Math.round(closes[i] * 100) / 100, companyName };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const rows = await query<{ ticker: string }>(`SELECT DISTINCT ticker FROM pipeline_ideas`);

    if (rows.length === 0) return res.status(200).json({ updated: 0, failed: [] });

    const results = { updated: 0, failed: [] as string[] };

    await Promise.all(rows.map(async ({ ticker }) => {
      // Try NSE first, then BSE fallback, then SME variants
      const suffixes = ['.NS', '.BO', '-SM.NS', '-SM.BO'];
      let price: { closePrice: number; companyName: string | null } | null = null;
      let tickerWithSuffix = '';
      for (const suffix of suffixes) {
        tickerWithSuffix = ticker + suffix;
        price = await fetchPrice(tickerWithSuffix);
        if (price) break;
      }

      if (!price) {
        results.failed.push(ticker);
        return;
      }

      await query(`
        UPDATE pipeline_ideas
        SET current_price = $1, updated_at = NOW()
        WHERE ticker = $2
      `, [price.closePrice, ticker]);

      // Also update company name if it was missing
      if (price.companyName) {
        await query(`
          UPDATE pipeline_ideas
          SET company_name = $1
          WHERE ticker = $2 AND (company_name IS NULL OR company_name = '')
        `, [price.companyName, ticker]);
      }

      results.updated++;
    }));

    return res.status(200).json(results);
  } catch (error) {
    console.error('Refresh prices error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
