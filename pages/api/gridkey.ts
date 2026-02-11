import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';

const GRIDKEY_KEY = 'gridkey:data';
const PRIVATE_INVESTMENTS_KEY = 'gridkey:privateInvestments';
const PORTFOLIO_KEY = 'portfolio:data';
const ENTRY_DATA_KEY_PREFIX = 'entrydata:';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      try {
        const [data, privateInvData] = await Promise.all([
          redis.get(GRIDKEY_KEY),
          redis.get(PRIVATE_INVESTMENTS_KEY)
        ]);

        const gridKeyData = data ? JSON.parse(data) : [];
        const privateInvestments = privateInvData
          ? JSON.parse(privateInvData)
          : { totalInvested: 0, count: 0 };

        res.status(200).json({ gridKeyData, privateInvestments });
      } catch (error) {
        console.error('Error reading GridKey data from Redis:', error);
        res.status(500).json({ error: 'Failed to read GridKey data' });
      }
    } else if (req.method === 'POST') {
      try {
        const { data: gridKeyData, privateInvestments } = req.body;

        if (!Array.isArray(gridKeyData)) {
          return res.status(400).json({ error: 'Data must be an array' });
        }

        // Get existing GridKey data to detect new stocks
        const existingDataStr = await redis.get(GRIDKEY_KEY);
        const existingData = existingDataStr ? JSON.parse(existingDataStr) : [];
        const existingCodes = new Set(
          existingData
            .map((item: any) => item.nseCode || item.bseCode)
            .filter((code: string | null) => code)
        );

        // Get existing entry data keys
        const entryDataKeys = await redis.keys(`${ENTRY_DATA_KEY_PREFIX}*`);
        const existingEntryDataCodes = new Set(
          entryDataKeys.map(key => key.replace(ENTRY_DATA_KEY_PREFIX, ''))
        );

        // Find new stocks (in new data but not in existing data AND don't have entry data yet)
        const newStockCodes: string[] = [];
        for (const item of gridKeyData) {
          const code = item.nseCode || item.bseCode;
          if (code && !existingCodes.has(code) && !existingEntryDataCodes.has(code)) {
            newStockCodes.push(code);
          }
        }

        // If there are new stocks, fetch their current prices from portfolio data
        if (newStockCodes.length > 0) {
          const portfolioDataStr = await redis.get(PORTFOLIO_KEY);
          const portfolioData = portfolioDataStr ? JSON.parse(portfolioDataStr) : [];

          // Create a map of stock codes to current prices
          const priceMap: Record<string, number> = {};
          for (const stock of portfolioData) {
            const code = stock.nseCode || stock.bseCode;
            if (code && stock.currentPrice) {
              priceMap[code] = stock.currentPrice;
            }
          }

          // Record entry data for new stocks
          const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
          for (const code of newStockCodes) {
            const entryPrice = priceMap[code];
            if (entryPrice) {
              const entryData = { entryDate: today, entryPrice };
              await redis.set(`${ENTRY_DATA_KEY_PREFIX}${code}`, JSON.stringify(entryData));
              console.log(`Recorded entry data for new stock ${code}: date=${today}, price=${entryPrice}`);
            }
          }
        }

        // Save the GridKey data
        await Promise.all([
          redis.set(GRIDKEY_KEY, JSON.stringify(gridKeyData)),
          redis.set(PRIVATE_INVESTMENTS_KEY, JSON.stringify(privateInvestments || { totalInvested: 0, count: 0 }))
        ]);

        res.status(200).json({
          success: true,
          message: 'GridKey data saved successfully',
          newStocksDetected: newStockCodes.length
        });
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
