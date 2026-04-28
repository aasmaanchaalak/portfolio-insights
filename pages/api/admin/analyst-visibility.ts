import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import {
  getGridKeyData,
  getAnalystOverrides,
  setAnalystOverride,
  clearAnalystOverride,
  ANALYST_VISIBILITY_THRESHOLD,
} from '../../../lib/queries';

const ADMIN_EMAIL = 'aditya@saguncapital.com';

interface SmallCompany {
  code: string;
  scripName: string;
  investedAmount: number;
  visibleToAnalyst: boolean;
  overridden: boolean;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userEmail = (req as any).user?.email;
  if (userEmail !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }

  try {
    if (req.method === 'GET') {
      const [gridKey, overrides] = await Promise.all([
        getGridKeyData(),
        getAnalystOverrides(),
      ]);

      const items: SmallCompany[] = [];
      for (const item of gridKey || []) {
        const code: string | null = item.nseCode || item.bseCode;
        if (!code) continue;
        const qty = Number(item.quantity) || 0;
        const avg = Number(item.averageBuyPrice) || 0;
        const investedAmount = qty * avg;
        if (investedAmount >= ANALYST_VISIBILITY_THRESHOLD) continue;

        const overridden = code in overrides;
        const visibleToAnalyst = overridden ? overrides[code] : false;
        items.push({
          code,
          scripName: item.scripName || code,
          investedAmount,
          visibleToAnalyst,
          overridden,
        });
      }

      items.sort((a, b) => b.investedAmount - a.investedAmount);
      return res.status(200).json({
        threshold: ANALYST_VISIBILITY_THRESHOLD,
        companies: items,
      });
    }

    if (req.method === 'PUT') {
      const { code, visible } = req.body || {};
      if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ error: 'code is required' });
      }
      if (typeof visible !== 'boolean') {
        return res.status(400).json({ error: 'visible must be boolean' });
      }
      await setAnalystOverride(code, visible);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { code } = req.body || {};
      if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ error: 'code is required' });
      }
      await clearAnalystOverride(code);
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('Analyst visibility API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
