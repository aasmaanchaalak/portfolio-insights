import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getHistory } from '../../../../lib/thesis/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { stockCode, limit, offset } = req.query;

  if (!stockCode || typeof stockCode !== 'string') {
    return res.status(400).json({ error: 'Stock code is required' });
  }

  try {
    const limitNum = parseInt(limit as string, 10) || 50;
    const offsetNum = parseInt(offset as string, 10) || 0;

    const { history, total } = await getHistory(stockCode, limitNum, offsetNum);

    res.status(200).json({
      history,
      total,
      hasMore: offsetNum + history.length < total,
    });
  } catch (error) {
    console.error('Error fetching thesis history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
}

export default withAuth(handler);
