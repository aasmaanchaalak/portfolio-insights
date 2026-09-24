import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { getAllForwardMetrics } from '../../../lib/thesis/queries';
import { getCurrentFiscalYear } from '../../../lib/queries';
import { deriveForwardTargets } from '../../../lib/fiscalYear';

// Bulk forward target prices for every stock that has a Forward Metrics grid.
// target price(FY) = EPS × target P/E, or (EBITDA × EV/EBITDA − net debt) ÷ shares
// when P/E is blank (see deriveForwardTargetDetails), keyed by absolute FY.
// Returns { currentFY, targets: { [stockCode]: { [fy]: price } } } so the client
// can compute a forward IRR from today's price to each year's target.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const [currentFY, all] = await Promise.all([
      getCurrentFiscalYear(),
      getAllForwardMetrics(),
    ]);

    const targets: Record<string, Record<number, number>> = {};
    for (const { stockCode, data } of all) {
      const derived = deriveForwardTargets(data);
      if (Object.keys(derived).length > 0) {
        targets[stockCode] = derived;
      }
    }

    return res.status(200).json({ currentFY, targets });
  } catch (error) {
    console.error('Forward targets API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
