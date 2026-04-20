import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getPortfolioHistory, savePortfolioHistoryEntry } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const history = await getPortfolioHistory();
        res.status(200).json(history);
      } catch (error) {
        console.error('Error reading portfolio history:', error);
        res.status(500).json({ error: 'Failed to read portfolio history' });
      }
    } else if (req.method === 'POST') {
      try {
        const { value, date } = req.body;

        if (typeof value !== 'number') {
          return res.status(400).json({ error: 'Value must be a number' });
        }

        let dateStr: string;
        if (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          dateStr = date;
        } else {
          // Default to today in IST
          const now = new Date();
          const istOffset = 5.5 * 60 * 60 * 1000;
          const istDate = new Date(now.getTime() + istOffset);
          dateStr = istDate.toISOString().split('T')[0];
        }

        await savePortfolioHistoryEntry(dateStr, value);
        res.status(200).json({ success: true, message: 'Portfolio history updated successfully' });
      } catch (error) {
        console.error('Error updating portfolio history:', error);
        res.status(500).json({ error: 'Failed to update portfolio history' });
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
