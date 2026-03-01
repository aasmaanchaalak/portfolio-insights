import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';
import { withAuth } from '../../lib/authMiddleware';

const ASSIGNMENT_KEY_PREFIX = 'assignment:';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      // Get all assignments
      try {
        const keys = await redis.keys(`${ASSIGNMENT_KEY_PREFIX}*`);
        const assignments: Record<string, string> = {};

        for (const key of keys) {
          const code = key.replace(ASSIGNMENT_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            assignments[code] = value;
          }
        }

        res.status(200).json(assignments);
      } catch (error) {
        console.error('Error reading assignments from Redis:', error);
        res.status(500).json({ error: 'Failed to read assignments' });
      }
    } else if (req.method === 'POST') {
      // Update assignment for a specific stock code
      try {
        const { code, assignedTo } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        if (assignedTo === null || assignedTo === '') {
          // Delete the assignment if it's empty
          await redis.del(`${ASSIGNMENT_KEY_PREFIX}${code}`);
        } else {
          // Set the assignment
          await redis.set(`${ASSIGNMENT_KEY_PREFIX}${code}`, assignedTo);
        }

        res.status(200).json({ success: true, message: 'Assignment updated successfully' });
      } catch (error) {
        console.error('Error updating assignment in Redis:', error);
        res.status(500).json({ error: 'Failed to update assignment' });
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
