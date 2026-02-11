import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';

const ENTRY_DATA_KEY_PREFIX = 'entrydata:';

export interface StockEntryData {
  entryDate: string;  // ISO date string (YYYY-MM-DD)
  entryPrice: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      // Get all entry data
      try {
        const keys = await redis.keys(`${ENTRY_DATA_KEY_PREFIX}*`);
        const entryData: Record<string, StockEntryData> = {};

        for (const key of keys) {
          const code = key.replace(ENTRY_DATA_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            entryData[code] = JSON.parse(value);
          }
        }

        res.status(200).json(entryData);
      } catch (error) {
        console.error('Error reading entry data from Redis:', error);
        res.status(500).json({ error: 'Failed to read entry data' });
      }
    } else if (req.method === 'POST') {
      // Update entry data for a specific stock code
      try {
        const { code, entryDate, entryPrice } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        if (!entryDate || entryPrice === undefined) {
          return res.status(400).json({ error: 'Entry date and price are required' });
        }

        const data: StockEntryData = {
          entryDate,
          entryPrice
        };

        await redis.set(`${ENTRY_DATA_KEY_PREFIX}${code}`, JSON.stringify(data));
        res.status(200).json({ success: true, message: 'Entry data saved successfully' });
      } catch (error) {
        console.error('Error saving entry data to Redis:', error);
        res.status(500).json({ error: 'Failed to save entry data' });
      }
    } else if (req.method === 'PUT') {
      // Bulk update entry data for multiple stocks (used when detecting new stocks)
      try {
        const { entries } = req.body;

        if (!Array.isArray(entries)) {
          return res.status(400).json({ error: 'Entries must be an array' });
        }

        for (const entry of entries) {
          const { code, entryDate, entryPrice } = entry;
          if (code && entryDate && entryPrice !== undefined) {
            const data: StockEntryData = { entryDate, entryPrice };
            await redis.set(`${ENTRY_DATA_KEY_PREFIX}${code}`, JSON.stringify(data));
          }
        }

        res.status(200).json({ success: true, message: `${entries.length} entry records saved` });
      } catch (error) {
        console.error('Error bulk saving entry data to Redis:', error);
        res.status(500).json({ error: 'Failed to save entry data' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'PUT']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Redis connection error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
}
