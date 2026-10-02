import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../../lib/authMiddleware';
import { buildDashboard } from '../../../lib/fo/dashboard';
import { canViewFo } from '../../../lib/fo/access';

// GET: the F&O dashboard (positions, month P&L, margin), for any signed-in user.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!canViewFo(authUser(req))) return res.status(403).json({ error: 'Forbidden' });
  try {
    res.status(200).json(await buildDashboard());
  } catch (error) {
    console.error('F&O dashboard error:', error);
    res.status(500).json({ error: 'Failed to build F&O dashboard' });
  }
}

export default withAuth(handler);
