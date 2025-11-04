import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';

const PORTFOLIO_KEY = 'portfolio:data';
const REMARKS_KEY_PREFIX = 'remarks:';
const ASSIGNMENT_KEY_PREFIX = 'assignment:';

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
        const remarksKeys = await redis.keys(`${REMARKS_KEY_PREFIX}*`);
        const remarksMap: Record<string, string> = {};

        for (const key of remarksKeys) {
          const code = key.replace(REMARKS_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            remarksMap[code] = value;
          }
        }

        // Fetch assignments and merge them with portfolio data
        const assignmentKeys = await redis.keys(`${ASSIGNMENT_KEY_PREFIX}*`);
        const assignmentsMap: Record<string, string> = {};

        for (const key of assignmentKeys) {
          const code = key.replace(ASSIGNMENT_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            assignmentsMap[code] = value;
          }
        }

        // Merge remarks and assignments into portfolio data based on nseCode or bseCode
        const enrichedData = portfolioData.map((stock: any) => {
          const code = stock.nseCode || stock.bseCode;
          return {
            ...stock,
            remarks: code && remarksMap[code] ? remarksMap[code] : null,
            assignedTo: code && assignmentsMap[code] ? assignmentsMap[code] : null
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

        // Process portfolio data and save remarks and assignments if included
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

          // If assignments are provided in the upload, save them to Redis
          if (code && stock.assignedTo !== undefined) {
            if (stock.assignedTo === null || stock.assignedTo === '') {
              // Delete assignment if empty
              redis.del(`${ASSIGNMENT_KEY_PREFIX}${code}`).catch(err =>
                console.error('Error deleting assignment:', err)
              );
            } else {
              // Save the assignment
              redis.set(`${ASSIGNMENT_KEY_PREFIX}${code}`, stock.assignedTo).catch(err =>
                console.error('Error saving assignment:', err)
              );
            }
          }

          // Remove remarks and assignments from the stock data before storing in portfolio
          const { remarks, assignedTo, ...stockWithoutExtras } = stock;
          return stockWithoutExtras;
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