import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../lib/authMiddleware';
import { getAllMtf, setMtf } from '../../lib/queries';

// Per-stock MTF (Margin Trading Facility) flag: with MTF / without MTF.
// Funding detail, so hidden from analysts like pledges.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (authUser(req).role === 'analyst') {
    return res.status(403).json({ error: 'Not available for analysts' });
  }
  try {
    if (req.method === 'GET') {
      res.status(200).json(await getAllMtf());
    } else if (req.method === 'POST') {
      const { code, mtf } = req.body || {};
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Stock code is required' });
      }
      await setMtf(code, mtf === true);
      res.status(200).json({ success: true });
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Error handling MTF:', error);
    res.status(500).json({ error: 'Failed to handle MTF' });
  }
}

export default withAuth(handler);
