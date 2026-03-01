import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';
import { withAuth } from '../../lib/authMiddleware';

const PORTFOLIO_HISTORY_KEY = 'portfolio:history';

interface HistoryEntry {
  date: string; // YYYY-MM-DD format
  value: number;
  timestamp: number;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      try {
        const data = await redis.get(PORTFOLIO_HISTORY_KEY);

        if (!data) {
          return res.status(200).json([]);
        }

        const history: HistoryEntry[] = JSON.parse(data);
        res.status(200).json(history);
      } catch (error) {
        console.error('Error reading portfolio history from Redis:', error);
        res.status(500).json({ error: 'Failed to read portfolio history' });
      }
    } else if (req.method === 'POST') {
      try {
        const { value } = req.body;

        if (typeof value !== 'number') {
          return res.status(400).json({ error: 'Value must be a number' });
        }

        // Get current date in YYYY-MM-DD format (IST timezone)
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istDate = new Date(now.getTime() + istOffset);
        const dateStr = istDate.toISOString().split('T')[0];

        // Fetch existing history
        const existingData = await redis.get(PORTFOLIO_HISTORY_KEY);
        let history: HistoryEntry[] = existingData ? JSON.parse(existingData) : [];

        // Check if entry for today already exists
        const todayIndex = history.findIndex(entry => entry.date === dateStr);

        const newEntry: HistoryEntry = {
          date: dateStr,
          value: value,
          timestamp: now.getTime()
        };

        if (todayIndex >= 0) {
          // Update existing entry for today
          history[todayIndex] = newEntry;
        } else {
          // Add new entry
          history.push(newEntry);
        }

        // Sort by date
        history.sort((a, b) => a.date.localeCompare(b.date));

        await redis.set(PORTFOLIO_HISTORY_KEY, JSON.stringify(history));
        res.status(200).json({ success: true, message: 'Portfolio history updated successfully' });
      } catch (error) {
        console.error('Error updating portfolio history in Redis:', error);
        res.status(500).json({ error: 'Failed to update portfolio history' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Redis connection error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
}

export default withAuth(handler);
