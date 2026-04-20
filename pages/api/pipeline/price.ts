import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { getPriceCached } from '../../../lib/pipeline/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { ticker } = req.query;
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'ticker is required' });
  }

  try {
    const price = await getPriceCached(ticker);
    return res.status(200).json({ price });
  } catch (error) {
    console.error('Price lookup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
