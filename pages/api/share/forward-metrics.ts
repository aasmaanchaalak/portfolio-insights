import { NextApiRequest, NextApiResponse } from 'next';
import { getGridKeyData, getPortfolioData, getCurrentFiscalYear } from '../../../lib/queries';
import { getAllForwardMetrics } from '../../../lib/thesis/queries';
import {
  computeForwardIRR,
  deriveForwardTargets,
  forwardWindow,
  fyLabel,
  parseFYLabel,
} from '../../../lib/fiscalYear';
import { ValuationTableData } from '../../../types/pe';

// Public "share" endpoint for Forward Metrics of current holdings.
// For each held stock that has a Forward Metrics grid, returns the full grid
// (every row, keyed by fiscal year) plus the derived target price
// (EPS × target P/E) and forward IRR from today's price to each FY-end in the
// current forward window, alongside sector, market cap (₹ cr), ROCE, trailing
// P/E and current EPS (price / P/E). Deliberately excludes quantity and amounts.
//
// Optional `?code=XYZ` narrows to a single NSE/BSE code.
//
// Auth: same static key as /api/share/portfolio — SHARE_API_KEY, passed as the
// `x-api-key` header (or `?key=` query param). Disabled (503) if unset.
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

  const codeFilter = typeof req.query.code === 'string' ? req.query.code.trim().toLowerCase() : '';

  try {
    const [gridKeyData, portfolioData, currentFY, allMetrics] = await Promise.all([
      getGridKeyData(),
      getPortfolioData(),
      getCurrentFiscalYear(),
      getAllForwardMetrics(),
    ]);

    const stockByCode = new Map<string, any>();
    for (const s of portfolioData || []) {
      if (s.nseCode) stockByCode.set(String(s.nseCode).toLowerCase(), s);
      if (s.bseCode) stockByCode.set(String(s.bseCode).toLowerCase(), s);
    }

    const metricsByCode = new Map<string, ValuationTableData>();
    for (const { stockCode, data } of allMetrics) {
      metricsByCode.set(String(stockCode).toLowerCase(), data);
    }

    const codesOf = (item: any) =>
      [item.nseCode, item.bseCode].filter(Boolean).map((c: any) => String(c).toLowerCase());

    const now = new Date();
    const fyWindow = forwardWindow(currentFY, 3);

    const results = (gridKeyData || [])
      .filter((item: any) => Number(item.quantity) > 0)
      .filter((item: any) => !codeFilter || codesOf(item).includes(codeFilter))
      .map((item: any) => {
        const codes = codesOf(item);
        const stock = codes.map(c => stockByCode.get(c)).find(Boolean) || {};
        const grid = codes.map(c => metricsByCode.get(c)).find(Boolean);
        if (!grid) return null;

        const currentPrice = stock.currentPrice != null ? Number(stock.currentPrice) : null;
        const pe = stock.priceToEarning != null ? Number(stock.priceToEarning) : null;
        // Trailing EPS isn't stored directly; derive it as price / P/E.
        const currentEPS = currentPrice != null && pe != null && pe > 0
          ? Number((currentPrice / pe).toFixed(2))
          : null;

        // Full grid, reshaped to { [rowLabel]: { [FYnnE]: value } } in column order.
        const columns = [...(grid.columns || [])].sort((a, b) => a.order - b.order);
        const rows = [...(grid.rows || [])].sort((a, b) => a.order - b.order);
        const cells = grid.cells || {};
        const metrics: Record<string, Record<string, number | null>> = {};
        for (const row of rows) {
          const byYear: Record<string, number | null> = {};
          for (const col of columns) {
            const fy = parseFYLabel(col.year);
            const key = fy != null ? fyLabel(fy, currentFY) : col.year;
            const v = cells[`${row.id}:${col.id}`];
            byYear[key] = typeof v === 'number' ? v : null;
          }
          metrics[row.label] = byYear;
        }

        const targets = deriveForwardTargets(grid);
        const forward = fyWindow.map(fy => {
          const target = targets[fy] ?? null;
          const irr = computeForwardIRR(currentPrice, target, fy, now);
          return {
            fy: fyLabel(fy, currentFY),
            targetPrice: target != null ? Number(target.toFixed(2)) : null,
            forwardIRR: irr != null ? Number(irr.toFixed(2)) : null,
          };
        });

        return {
          name: item.scripName || stock.name || item.nseCode || item.bseCode || 'Unknown',
          nseCode: item.nseCode || null,
          bseCode: item.bseCode || null,
          sector: stock.industry || stock.industryGroup || null,
          industryGroup: stock.industryGroup || null,
          marketCap: stock.marketCap != null ? Number(stock.marketCap) : null, // ₹ crore
          roce: stock.roce != null ? Number(stock.roce) : null,
          currentPrice,
          pe,
          currentEPS,
          forward,
          metrics,
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      currentFY: fyLabel(currentFY, currentFY),
      stocks: results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error building share forward metrics:', error);
    return res.status(500).json({ error: 'Failed to build forward metrics data' });
  }
}

export default handler;
