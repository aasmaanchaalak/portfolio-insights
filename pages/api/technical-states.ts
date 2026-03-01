import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';
import { withAuth } from '../../lib/authMiddleware';

const TECHNICAL_STATES_KEY = 'dashboard:technicalStates';

export interface StoredTechnicalState {
  stockCode: string;
  stockName: string;
  above50DMA: boolean;
  above200DMA: boolean;
  dma50Above200: boolean;
  near52WeekHigh: boolean;
  near52WeekLow: boolean;
  profitGrowthAbove15: boolean;
  salesGrowthAbove15: boolean;
  timestamp: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      try {
        const data = await redis.get(TECHNICAL_STATES_KEY);
        const states = data ? JSON.parse(data) : [];
        res.status(200).json(states);
      } catch (error) {
        console.error('Error reading technical states from Redis:', error);
        res.status(500).json({ error: 'Failed to read technical states' });
      }
    } else if (req.method === 'POST') {
      try {
        const { states } = req.body;

        if (!Array.isArray(states)) {
          return res.status(400).json({ error: 'States must be an array' });
        }

        await redis.set(TECHNICAL_STATES_KEY, JSON.stringify(states));
        res.status(200).json({ success: true, message: 'Technical states saved successfully' });
      } catch (error) {
        console.error('Error saving technical states to Redis:', error);
        res.status(500).json({ error: 'Failed to save technical states' });
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
