import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';
import { withAuth } from '../../lib/authMiddleware';
import { StockPositioning } from '../../types/positioning';

const PORTFOLIO_KEY = 'portfolio:data';
const REMARKS_KEY_PREFIX = 'remarks:';
const ASSIGNMENT_KEY_PREFIX = 'assignment:';
const BUCKET_KEY_PREFIX = 'bucket:';
const ENTRY_DATA_KEY_PREFIX = 'entrydata:';
const POSITIONING_KEY_PREFIX = 'positioning:';

async function handler(req: NextApiRequest, res: NextApiResponse) {
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

        // Fetch buckets and merge them with portfolio data
        const bucketKeys = await redis.keys(`${BUCKET_KEY_PREFIX}*`);
        const bucketsMap: Record<string, string> = {};

        for (const key of bucketKeys) {
          const code = key.replace(BUCKET_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            bucketsMap[code] = value;
          }
        }

        // Fetch entry data and merge them with portfolio data
        const entryDataKeys = await redis.keys(`${ENTRY_DATA_KEY_PREFIX}*`);
        const entryDataMap: Record<string, { entryDate: string; entryPrice: number }> = {};

        for (const key of entryDataKeys) {
          const code = key.replace(ENTRY_DATA_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            entryDataMap[code] = JSON.parse(value);
          }
        }

        // Fetch positioning data and merge with portfolio data
        const positioningKeys = await redis.keys(`${POSITIONING_KEY_PREFIX}*`);
        const positioningMap: Record<string, StockPositioning> = {};

        for (const key of positioningKeys) {
          const code = key.replace(POSITIONING_KEY_PREFIX, '');
          const value = await redis.get(key);
          if (value) {
            try {
              positioningMap[code] = JSON.parse(value);
            } catch (e) {
              console.error(`Error parsing positioning for ${code}:`, e);
            }
          }
        }

        // Merge remarks, assignments, buckets, entry data, and positioning into portfolio data
        const enrichedData = portfolioData.map((stock: any) => {
          const code = stock.nseCode || stock.bseCode;
          const entryData = code && entryDataMap[code] ? entryDataMap[code] : null;
          return {
            ...stock,
            remarks: code && remarksMap[code] ? remarksMap[code] : null,
            assignedTo: code && assignmentsMap[code] ? assignmentsMap[code] : null,
            bucket: code && bucketsMap[code] ? bucketsMap[code] : null,
            entryDate: entryData ? entryData.entryDate : null,
            entryPrice: entryData ? entryData.entryPrice : null,
            positioning: code && positioningMap[code] ? positioningMap[code] : null
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

          // If buckets are provided in the upload, save them to Redis
          if (code && stock.bucket !== undefined) {
            if (stock.bucket === null || stock.bucket === '') {
              // Delete bucket if empty
              redis.del(`${BUCKET_KEY_PREFIX}${code}`).catch(err =>
                console.error('Error deleting bucket:', err)
              );
            } else {
              // Save the bucket
              redis.set(`${BUCKET_KEY_PREFIX}${code}`, stock.bucket).catch(err =>
                console.error('Error saving bucket:', err)
              );
            }
          }

          // If entry data is provided in the upload, save it to Redis
          if (code && stock.entryDate !== undefined && stock.entryPrice !== undefined) {
            if (stock.entryDate === null || stock.entryPrice === null) {
              // Delete entry data if empty
              redis.del(`${ENTRY_DATA_KEY_PREFIX}${code}`).catch(err =>
                console.error('Error deleting entry data:', err)
              );
            } else {
              // Save the entry data
              const entryData = { entryDate: stock.entryDate, entryPrice: stock.entryPrice };
              redis.set(`${ENTRY_DATA_KEY_PREFIX}${code}`, JSON.stringify(entryData)).catch(err =>
                console.error('Error saving entry data:', err)
              );
            }
          }

          // If positioning is provided in the upload, save it to Redis
          if (code && stock.positioning !== undefined) {
            if (stock.positioning === null) {
              // Delete positioning if null
              redis.del(`${POSITIONING_KEY_PREFIX}${code}`).catch(err =>
                console.error('Error deleting positioning:', err)
              );
            } else {
              // Save the positioning
              redis.set(`${POSITIONING_KEY_PREFIX}${code}`, JSON.stringify(stock.positioning)).catch(err =>
                console.error('Error saving positioning:', err)
              );
            }
          }

          // Remove remarks, assignments, buckets, entry data, and positioning from the stock data before storing
          const { remarks, assignedTo, bucket, entryDate, entryPrice, positioning, ...stockWithoutExtras } = stock;
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

export default withAuth(handler);