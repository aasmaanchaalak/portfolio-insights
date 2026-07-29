import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getAllPledges, setPledge, PledgeWhere } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const pledges = await getAllPledges();
        res.status(200).json(pledges);
      } catch (error) {
        console.error('Error reading pledges:', error);
        res.status(500).json({ error: 'Failed to read pledges' });
      }
    } else if (req.method === 'POST') {
      try {
        const { code, pledgedQty, pledgedWhere } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        const qty = pledgedQty === '' || pledgedQty === undefined || pledgedQty === null
          ? null
          : Number(pledgedQty);

        if (qty !== null && (isNaN(qty) || qty < 0)) {
          return res.status(400).json({ error: 'Pledged quantity must be a non-negative number' });
        }

        const where: PledgeWhere | null = pledgedWhere === 'LAS' || pledgedWhere === 'F&O'
          ? pledgedWhere
          : null;

        await setPledge(code, qty, where);
        res.status(200).json({ success: true, message: 'Pledge updated successfully' });
      } catch (error) {
        console.error('Error updating pledge:', error);
        res.status(500).json({ error: 'Failed to update pledge' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
}

export default withAuth(handler);
