import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { getCurrentFiscalYear, setCurrentFiscalYear } from '../../../lib/queries';

const ADMIN_EMAIL = 'aditya@saguncapital.com';

// GET  → { currentFY }               (any authenticated user)
// PUT  → { action: 'advance' }       advance to next FY        (admin only)
//        { currentFY: 2027 }         set an explicit FY        (admin only)
async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const currentFY = await getCurrentFiscalYear();
      return res.status(200).json({ currentFY });
    }

    if (req.method === 'PUT') {
      const userEmail = (req as any).user?.email;
      if (userEmail !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Access denied. Admin only.' });
      }

      const { action, currentFY } = req.body || {};
      let next: number;
      if (action === 'advance') {
        next = (await getCurrentFiscalYear()) + 1;
      } else if (Number.isFinite(currentFY)) {
        next = Math.trunc(currentFY);
      } else {
        return res.status(400).json({ error: 'Provide action:"advance" or a numeric currentFY' });
      }

      const saved = await setCurrentFiscalYear(next);
      return res.status(200).json({ currentFY: saved });
    }

    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('Fiscal-year settings API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
