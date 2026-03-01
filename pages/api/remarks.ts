import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';
import { withAuth } from '../../lib/authMiddleware';

const REMARKS_KEY_PREFIX = 'remarks:';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      // Get all remarks
      try {
        const keys = await redis.keys(`${REMARKS_KEY_PREFIX}*`);
        const remarks: Record<string, string> = {};

        for (const key of keys) {
          const code = key.replace(REMARKS_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            remarks[code] = value;
          }
        }

        res.status(200).json(remarks);
      } catch (error) {
        console.error('Error reading remarks from Redis:', error);
        res.status(500).json({ error: 'Failed to read remarks' });
      }
    } else if (req.method === 'POST') {
      // Update remarks for a specific stock code
      try {
        const { code, remark } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        if (remark === null || remark === '') {
          // Delete the remark if it's empty
          await redis.del(`${REMARKS_KEY_PREFIX}${code}`);
        } else {
          // Set the remark
          await redis.set(`${REMARKS_KEY_PREFIX}${code}`, remark);
        }

        res.status(200).json({ success: true, message: 'Remark updated successfully' });
      } catch (error) {
        console.error('Error updating remark in Redis:', error);
        res.status(500).json({ error: 'Failed to update remark' });
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
