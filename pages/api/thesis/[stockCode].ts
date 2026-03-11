import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/authMiddleware';
import {
  getThesisByStockCode,
  getRecentHistory,
  updateThesis,
} from '../../../lib/thesis/queries';
import { UpdateThesisRequest } from '../../../types/thesis';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { stockCode } = req.query;
  const userEmail = (req as AuthenticatedRequest).user?.email;

  if (!stockCode || typeof stockCode !== 'string') {
    return res.status(400).json({ error: 'Stock code is required' });
  }

  try {
    if (req.method === 'GET') {
      const thesis = await getThesisByStockCode(stockCode);
      const recentHistory = thesis ? await getRecentHistory(thesis.id, 5) : [];

      res.status(200).json({
        thesis,
        recentHistory,
      });
    } else if (req.method === 'PUT') {
      const data: UpdateThesisRequest = req.body;
      const thesis = await updateThesis(stockCode, data, userEmail);

      if (!thesis) {
        return res.status(404).json({ error: 'Thesis not found' });
      }

      const recentHistory = await getRecentHistory(thesis.id, 5);
      res.status(200).json({ success: true, thesis, recentHistory });
    } else {
      res.setHeader('Allow', ['GET', 'PUT']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Error handling thesis request:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
}

export default withAuth(handler);
