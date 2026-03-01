import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';
import { withAuth } from '../../lib/authMiddleware';

const BUCKET_KEY_PREFIX = 'bucket:';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      // Get all buckets
      try {
        const keys = await redis.keys(`${BUCKET_KEY_PREFIX}*`);
        const buckets: Record<string, string> = {};

        for (const key of keys) {
          const code = key.replace(BUCKET_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            buckets[code] = value;
          }
        }

        res.status(200).json(buckets);
      } catch (error) {
        console.error('Error reading buckets from Redis:', error);
        res.status(500).json({ error: 'Failed to read buckets' });
      }
    } else if (req.method === 'POST') {
      // Update bucket for a specific stock code
      try {
        const { code, bucket } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        if (bucket === null || bucket === '') {
          // Delete the bucket if it's empty
          await redis.del(`${BUCKET_KEY_PREFIX}${code}`);
        } else {
          // Set the bucket
          await redis.set(`${BUCKET_KEY_PREFIX}${code}`, bucket);
        }

        res.status(200).json({ success: true, message: 'Bucket updated successfully' });
      } catch (error) {
        console.error('Error updating bucket in Redis:', error);
        res.status(500).json({ error: 'Failed to update bucket' });
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
