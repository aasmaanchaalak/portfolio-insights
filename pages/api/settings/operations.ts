import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../../lib/authMiddleware';
import { getOpsSettings, updateOpsSettings, OpsSettings } from '../../../lib/firmSettings';

// Admin-only operating settings (not public like /api/settings/firm):
// GET → { foPortfolio, analystMinInvested }
// PUT → { foPortfolio?, analystMinInvested? }
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!authUser(req).isAdmin) {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await getOpsSettings());
    }
    if (req.method === 'PUT') {
      const { foPortfolio, analystMinInvested } = req.body || {};
      const patch: Partial<OpsSettings> = {};
      if (foPortfolio !== undefined) {
        if (typeof foPortfolio !== 'string' || foPortfolio.length > 100) {
          return res.status(400).json({ error: 'F&O portfolio name must be at most 100 characters' });
        }
        patch.foPortfolio = foPortfolio;
      }
      if (analystMinInvested !== undefined) {
        const n = Number(analystMinInvested);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ error: 'Analyst threshold must be a non-negative amount' });
        }
        patch.analystMinInvested = n;
      }
      return res.status(200).json(await updateOpsSettings(patch));
    }
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('Operations settings API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
