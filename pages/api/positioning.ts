import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';
import { withAuth } from '../../lib/authMiddleware';
import { StockPositioning, DEFAULT_POSITIONING } from '../../types/positioning';

const POSITIONING_KEY_PREFIX = 'positioning:';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      // Get all positioning data
      try {
        const keys = await redis.keys(`${POSITIONING_KEY_PREFIX}*`);
        const positioningData: Record<string, StockPositioning> = {};

        for (const key of keys) {
          const code = key.replace(POSITIONING_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            try {
              positioningData[code] = JSON.parse(value);
            } catch (e) {
              console.error(`Error parsing positioning for ${code}:`, e);
            }
          }
        }

        res.status(200).json(positioningData);
      } catch (error) {
        console.error('Error reading positioning from Redis:', error);
        res.status(500).json({ error: 'Failed to read positioning data' });
      }
    } else if (req.method === 'POST') {
      // Update positioning for a specific stock code
      try {
        const { code, conviction, strategyType, actionIntent, timeHorizon } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        // Validate and build positioning object
        const positioning: StockPositioning = {
          conviction: conviction || DEFAULT_POSITIONING.conviction,
          strategyType: strategyType || DEFAULT_POSITIONING.strategyType,
          actionIntent: actionIntent || DEFAULT_POSITIONING.actionIntent,
        };

        // Add optional timeHorizon if provided
        if (timeHorizon) {
          positioning.timeHorizon = timeHorizon;
        }

        // Store as JSON string
        await redis.set(`${POSITIONING_KEY_PREFIX}${code}`, JSON.stringify(positioning));

        res.status(200).json({ success: true, message: 'Positioning updated successfully', positioning });
      } catch (error) {
        console.error('Error updating positioning in Redis:', error);
        res.status(500).json({ error: 'Failed to update positioning' });
      }
    } else if (req.method === 'DELETE') {
      // Delete positioning for a specific stock code
      try {
        const { code } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        await redis.del(`${POSITIONING_KEY_PREFIX}${code}`);
        res.status(200).json({ success: true, message: 'Positioning deleted successfully' });
      } catch (error) {
        console.error('Error deleting positioning in Redis:', error);
        res.status(500).json({ error: 'Failed to delete positioning' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Redis connection error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
}

export default withAuth(handler);
