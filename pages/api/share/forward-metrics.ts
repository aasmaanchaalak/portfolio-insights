import { NextApiRequest, NextApiResponse } from 'next';
import { getGridKeyData, getPortfolioData, getCurrentFiscalYear, getRealizedExits } from '../../../lib/queries';
import { getAllForwardMetrics } from '../../../lib/thesis/queries';
import { listIdeas } from '../../../lib/pipeline/queries';
import {
  computeForwardIRR,
  deriveForwardTargetDetails,
  forwardWindow,
  fyLabel,
  parseFYLabel,
} from '../../../lib/fiscalYear';
import { ValuationTableData } from '../../../types/pe';

// Public "share" endpoint for Forward Metrics of holdings, pipeline ideas and
// exited stocks. For each such stock that has a Forward Metrics grid, returns
// its `category` ('portfolio' | 'pipeline' | 'exited'), pipeline stage, the full grid
// (every row, keyed by fiscal year) plus the derived target price
// (EPS × target P/E, or EV/EBITDA-based when P/E is blank) and forward IRR from today's price to each FY-end in the
// current forward window, alongside sector, shares outstanding (market cap /
// price), ROCE and current EPS (price / P/E). Deliberately excludes quantity,
// amounts, and the price / P/E / market cap inputs themselves.
//
// Category precedence: currently held → 'portfolio'; pipeline idea tagged Exited (or a
// recorded realized exit with no pipeline idea) → 'exited'; any other pipeline
// stage → 'pipeline'. A stock with a grid that is none of these is omitted.
//
// Optional `?code=XYZ` narrows to a single NSE/BSE code, and
// `?category=portfolio,pipeline,exited` to one or more categories.
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
  const categoryFilter = typeof req.query.category === 'string'
    ? new Set(req.query.category.split(',').map(c => c.trim().toLowerCase()).filter(Boolean))
    : null;

  try {
    const [gridKeyData, portfolioData, currentFY, allMetrics, ideas, exits] = await Promise.all([
      getGridKeyData(),
      getPortfolioData(),
      getCurrentFiscalYear(),
      getAllForwardMetrics(),
      listIdeas(),
      getRealizedExits(),
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

    // Universe of stocks to report, in precedence order; the first claim on a
    // code wins so a held stock never also shows up as a pipeline idea.
    type Category = 'portfolio' | 'pipeline' | 'exited';
    interface Subject {
      codes: string[];
      nseCode: string | null;
      bseCode: string | null;
      name: string;
      category: Category;
      pipelineStage: string | null;
      fallbackPrice: number | null;
    }
    const subjects: Subject[] = [];
    const claimed = new Set<string>();
    const add = (subj: Subject) => {
      if (subj.codes.length === 0 || subj.codes.some(c => claimed.has(c))) return;
      subj.codes.forEach(c => claimed.add(c));
      subjects.push(subj);
    };

    for (const item of gridKeyData || []) {
      if (!(Number(item.quantity) > 0)) continue;
      add({
        codes: codesOf(item),
        nseCode: item.nseCode || null,
        bseCode: item.bseCode || null,
        name: item.scripName || item.nseCode || item.bseCode || 'Unknown',
        category: 'portfolio',
        pipelineStage: null,
        fallbackPrice: null,
      });
    }

    // Pipeline tickers are a single NSE or BSE code; resolve the other one from
    // screener data when the stock is there.
    const isBse = (t: string) => /^\d+$/.test(t);
    for (const idea of ideas) {
      const t = String(idea.ticker).toLowerCase();
      const stock = stockByCode.get(t);
      add({
        codes: [t],
        nseCode: stock?.nseCode || (isBse(t) ? null : idea.ticker),
        bseCode: stock?.bseCode || (isBse(t) ? idea.ticker : null),
        name: idea.companyName || stock?.name || idea.ticker,
        category: idea.tag === 'Exited' ? 'exited' : 'pipeline',
        pipelineStage: idea.stage,
        fallbackPrice: idea.currentPrice,
      });
    }

    for (const e of exits) {
      const t = String(e.ticker).toLowerCase();
      const stock = stockByCode.get(t);
      add({
        codes: [t],
        nseCode: stock?.nseCode || (isBse(t) ? null : e.ticker),
        bseCode: stock?.bseCode || (isBse(t) ? e.ticker : null),
        name: e.companyName || stock?.name || e.ticker,
        category: 'exited',
        pipelineStage: null,
        fallbackPrice: null,
      });
    }

    const results = subjects
      .filter(subj => !codeFilter || subj.codes.includes(codeFilter))
      .filter(subj => !categoryFilter || categoryFilter.has(subj.category))
      .map(subj => {
        const stock = subj.codes.map(c => stockByCode.get(c)).find(Boolean) || {};
        const grid = subj.codes.map(c => metricsByCode.get(c)).find(Boolean);
        if (!grid) return null;

        // Screener price first; pipeline ideas not in the screener fall back to
        // the pipeline's cached close.
        const currentPrice = stock.currentPrice != null ? Number(stock.currentPrice) : subj.fallbackPrice;
        const pe = stock.priceToEarning != null ? Number(stock.priceToEarning) : null;
        // Trailing EPS isn't stored directly; derive it as price / P/E.
        const currentEPS = currentPrice != null && pe != null && pe > 0
          ? Number((currentPrice / pe).toFixed(2))
          : null;
        // Shares outstanding = market cap / price. marketCap is in ₹ crore, so
        // convert crore → ₹ (×1e7) first.
        const marketCapCr = stock.marketCap != null ? Number(stock.marketCap) : null;
        const sharesOutstanding = marketCapCr != null && marketCapCr > 0 && currentPrice != null && currentPrice > 0
          ? Math.round((marketCapCr * 1e7) / currentPrice)
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

        const targets = deriveForwardTargetDetails(grid);
        const forward = fyWindow.map(fy => {
          const target = targets[fy]?.price ?? null;
          const irr = computeForwardIRR(currentPrice, target, fy, now);
          return {
            fy: fyLabel(fy, currentFY),
            targetPrice: target != null ? Number(target.toFixed(2)) : null,
            targetMethod: targets[fy]?.method ?? null, // 'pe' | 'evEbitda'
            forwardIRR: irr != null ? Number(irr.toFixed(2)) : null,
          };
        });

        return {
          name: subj.name,
          nseCode: subj.nseCode,
          bseCode: subj.bseCode,
          category: subj.category,
          pipelineStage: subj.pipelineStage,
          sector: stock.industry || stock.industryGroup || null,
          industryGroup: stock.industryGroup || null,
          sharesOutstanding,
          roce: stock.roce != null ? Number(stock.roce) : null,
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
