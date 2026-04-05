import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getAllRemarks, setRemark } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const remarks = await getAllRemarks();
        res.status(200).json(remarks);
      } catch (error) {
        console.error('Error reading remarks:', error);
        res.status(500).json({ error: 'Failed to read remarks' });
      }
    } else if (req.method === 'POST') {
      try {
        const { code, remark } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        await setRemark(code, remark === '' ? null : remark);
        res.status(200).json({ success: true, message: 'Remark updated successfully' });
      } catch (error) {
        console.error('Error updating remark:', error);
        res.status(500).json({ error: 'Failed to update remark' });
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
