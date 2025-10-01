import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';

const PORTFOLIO_KEY = 'portfolio:data';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      try {
        const data = await redis.get(PORTFOLIO_KEY);
        
        if (!data) {
          // Return empty array if no data exists
          return res.status(200).json([]);
        }
        
        const portfolioData = JSON.parse(data);
        res.status(200).json(portfolioData);
      } catch (error) {
        console.error('Error reading portfolio data from Redis:', error);
        res.status(500).json({ error: 'Failed to read portfolio data' });
      }
    } else if (req.method === 'POST') {
      try {
        const { data: portfolioData } = req.body;
        
        if (!Array.isArray(portfolioData)) {
          return res.status(400).json({ error: 'Data must be an array' });
        }

        await redis.set(PORTFOLIO_KEY, JSON.stringify(portfolioData));
        res.status(200).json({ success: true, message: 'Portfolio data updated successfully' });
      } catch (error) {
        console.error('Error updating portfolio data in Redis:', error);
        res.status(500).json({ error: 'Failed to update portfolio data' });
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