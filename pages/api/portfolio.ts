import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';

const PORTFOLIO_KEY = 'portfolio:data';
const REMARKS_KEY_PREFIX = 'remarks:';

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

        // Fetch remarks and merge them with portfolio data
        const keys = await redis.keys(`${REMARKS_KEY_PREFIX}*`);
        const remarksMap: Record<string, string> = {};

        for (const key of keys) {
          const code = key.replace(REMARKS_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            remarksMap[code] = value;
          }
        }

        // Merge remarks into portfolio data based on nseCode or bseCode
        const enrichedData = portfolioData.map((stock: any) => {
          const code = stock.nseCode || stock.bseCode;
          return {
            ...stock,
            remarks: code && remarksMap[code] ? remarksMap[code] : null
          };
        });

        res.status(200).json(enrichedData);
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

        // Fetch existing remarks
        const keys = await redis.keys(`${REMARKS_KEY_PREFIX}*`);
        const remarksMap: Record<string, string> = {};

        for (const key of keys) {
          const code = key.replace(REMARKS_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            remarksMap[code] = value;
          }
        }

        // Process portfolio data and save remarks if included
        const cleanedData = portfolioData.map((stock: any) => {
          const code = stock.nseCode || stock.bseCode;

          // If remarks are provided in the upload, save them to Redis
          if (code && stock.remarks !== undefined) {
            if (stock.remarks === null || stock.remarks === '') {
              // Delete remark if empty
              redis.del(`${REMARKS_KEY_PREFIX}${code}`).catch(err =>
                console.error('Error deleting remark:', err)
              );
            } else {
              // Save the remark
              redis.set(`${REMARKS_KEY_PREFIX}${code}`, stock.remarks).catch(err =>
                console.error('Error saving remark:', err)
              );
            }
          }

          // Remove remarks from the stock data before storing in portfolio
          const { remarks, ...stockWithoutRemarks } = stock;
          return stockWithoutRemarks;
        });

        await redis.set(PORTFOLIO_KEY, JSON.stringify(cleanedData));
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