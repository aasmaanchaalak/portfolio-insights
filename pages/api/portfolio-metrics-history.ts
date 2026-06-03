import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import {
  getPortfolioMetricsHistory,
  savePortfolioMetricsEntry,
  PortfolioMetricsEntry,
} from '../../lib/queries';

const METRIC_KEYS: (keyof PortfolioMetricsEntry)[] = [
  'avgPE', 'avgProfitGrowth', 'avgSalesGrowth', 'avgMarketCap', 'avgRSI', 'avgROCE',
  'avgDMA50', 'avgDMA200', 'avgDownFrom52WH', 'avgUpFrom52WL',
  'weightedAllTimeGain', 'weighted1YReturn', 'top5Concentration',
];

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const history = await getPortfolioMetricsHistory();
        res.status(200).json(history);
      } catch (error) {
        console.error('Error reading portfolio metrics history:', error);
        res.status(500).json({ error: 'Failed to read portfolio metrics history' });
      }
    } else if (req.method === 'POST') {
      try {
        const { metrics, date } = req.body;

        if (!metrics || typeof metrics !== 'object') {
          return res.status(400).json({ error: 'metrics object is required' });
        }

        // Normalise: keep only known keys, coerce to number or null.
        const entry = {} as PortfolioMetricsEntry;
        for (const key of METRIC_KEYS) {
          const v = metrics[key];
          entry[key] = typeof v === 'number' && Number.isFinite(v) ? v : null;
        }

        let dateStr: string;
        if (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          dateStr = date;
        } else {
          // Default to today in IST (matches portfolio-history behaviour)
          const now = new Date();
          const istOffset = 5.5 * 60 * 60 * 1000;
          const istDate = new Date(now.getTime() + istOffset);
          dateStr = istDate.toISOString().split('T')[0];
        }

        await savePortfolioMetricsEntry(dateStr, entry);
        res.status(200).json({ success: true, message: 'Portfolio metrics history updated successfully' });
      } catch (error) {
        console.error('Error updating portfolio metrics history:', error);
        res.status(500).json({ error: 'Failed to update portfolio metrics history' });
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
