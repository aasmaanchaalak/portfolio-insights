import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { listGuidance, createGuidance } from '../../../../lib/pipeline/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET': {
        const guidance = await listGuidance();
        return res.status(200).json({ guidance });
      }

      case 'POST': {
        const { ticker, companyName, metric, guidedValue, guidedUnit, currentValue, timeframe, sourceContext } = req.body;
        if (!ticker || !companyName || !metric) {
          return res.status(400).json({ error: 'ticker, companyName, and metric are required' });
        }
        const entry = await createGuidance({ ticker, companyName, metric, guidedValue, guidedUnit, currentValue, timeframe, sourceContext });
        return res.status(201).json({ guidance: entry });
      }

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Guidance API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
