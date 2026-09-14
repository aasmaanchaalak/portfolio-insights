import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getFYStartPrices, saveFYStartPrices } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const prices = await getFYStartPrices();
      return res.status(200).json({ prices });
    }

    if (req.method === 'POST') {
      const { prices } = req.body;
      if (!Array.isArray(prices)) {
        return res.status(400).json({ error: 'prices must be an array of { ticker, price }' });
      }
      const saved = await saveFYStartPrices(prices);
      return res.status(200).json({ success: true, saved });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error('Error handling FY-start prices:', error);
    return res.status(500).json({ error: 'Failed to process FY-start prices' });
  }
}

export default withAuth(handler);
