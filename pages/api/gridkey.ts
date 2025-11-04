import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';

const GRIDKEY_KEY = 'gridkey:data';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      try {
        const data = await redis.get(GRIDKEY_KEY);

        if (!data) {
          // Return empty array if no data exists
          return res.status(200).json([]);
        }

        const gridKeyData = JSON.parse(data);
        res.status(200).json(gridKeyData);
      } catch (error) {
        console.error('Error reading GridKey data from Redis:', error);
        res.status(500).json({ error: 'Failed to read GridKey data' });
      }
    } else if (req.method === 'POST') {
      try {
        const { data: gridKeyData } = req.body;

        if (!Array.isArray(gridKeyData)) {
          return res.status(400).json({ error: 'Data must be an array' });
        }

        await redis.set(GRIDKEY_KEY, JSON.stringify(gridKeyData));
        res.status(200).json({ success: true, message: 'GridKey data saved successfully' });
      } catch (error) {
        console.error('Error saving GridKey data to Redis:', error);
        res.status(500).json({ error: 'Failed to save GridKey data' });
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
