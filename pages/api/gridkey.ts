import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../lib/authMiddleware';
import { getGridKeyResponse } from '../../lib/portfolioResponse';
import { saveHoldingsSnapshot } from '../../lib/pfSnapshot';

// GET: holdings for the app. POST: a complete PF export (see lib/pfSnapshot.ts).
async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        res.status(200).json(await getGridKeyResponse(authUser(req).role));
      } catch (error) {
        console.error('Error reading GridKey data:', error);
        res.status(500).json({ error: 'Failed to read GridKey data' });
      }
    } else if (req.method === 'POST') {
      try {
        const { data: gridKeyData, privateInvestments, foHoldings } = req.body;

        if (!Array.isArray(gridKeyData)) {
          return res.status(400).json({ error: 'Data must be an array' });
        }

        const user = authUser(req);
        const { newStocks, exitedStocks } = await saveHoldingsSnapshot({
          data: gridKeyData,
          privateInvestments,
          accountRows: Array.isArray(foHoldings) ? foHoldings : null,
          by: user.name || user.email,
        });

        res.status(200).json({
          success: true,
          message: 'PF data saved successfully',
          newStocksDetected: newStocks.length,
          newStocks,
          exitedStocksDetected: exitedStocks.length,
          exitedStocks,
        });
      } catch (error) {
        console.error('Error saving GridKey data:', error);
        res.status(500).json({ error: 'Failed to save GridKey data' });
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
