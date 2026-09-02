import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import {
  getGridKeyData,
  saveGridKeyData,
  getPrivateInvestments,
  savePrivateInvestments,
  getPortfolioData,
  getAllEntryData,
  setEntryData,
  getUserByEmail,
  getAnalystOverrides,
  isVisibleToAnalyst,
} from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const [gridKeyData, privateInvestments] = await Promise.all([
          getGridKeyData(),
          getPrivateInvestments()
        ]);

        const userEmail = (req as any).user?.email;
        const user = userEmail ? await getUserByEmail(userEmail) : null;
        let visibleData = gridKeyData || [];
        if (user?.role === 'analyst') {
          const overrides = await getAnalystOverrides();
          visibleData = visibleData.filter((item: any) => {
            const code = item.nseCode || item.bseCode;
            const invested = (Number(item.quantity) || 0) * (Number(item.averageBuyPrice) || 0);
            return isVisibleToAnalyst(invested, code, overrides);
          });
        }

        res.status(200).json({
          gridKeyData: visibleData,
          privateInvestments
        });
      } catch (error) {
        console.error('Error reading GridKey data:', error);
        res.status(500).json({ error: 'Failed to read GridKey data' });
      }
    } else if (req.method === 'POST') {
      try {
        const { data: gridKeyData, privateInvestments } = req.body;

        if (!Array.isArray(gridKeyData)) {
          return res.status(400).json({ error: 'Data must be an array' });
        }

        // Get existing GridKey data to detect new stocks
        const existingData = await getGridKeyData() || [];
        const existingCodes = new Set(
          existingData
            .map((item: any) => item.nseCode || item.bseCode)
            .filter((code: string | null) => code)
        );

        // Get existing entry data codes
        const existingEntryData = await getAllEntryData();
        const existingEntryDataCodes = new Set(Object.keys(existingEntryData));

        // Find new stocks (in new data but not in existing data AND don't have entry data yet)
        const newStockCodes: string[] = [];
        const newStocks: { code: string; name: string }[] = [];
        for (const item of gridKeyData) {
          const code = item.nseCode || item.bseCode;
          if (code && !existingCodes.has(code) && !existingEntryDataCodes.has(code)) {
            newStockCodes.push(code);
            newStocks.push({ code, name: item.scripName || code });
          }
        }

        // If there are new stocks, record their entry data
        if (newStockCodes.length > 0) {
          const portfolioData = await getPortfolioData() || [];

          // Create a map of stock codes to current prices from portfolio data
          const priceMap: Record<string, number> = {};
          for (const stock of portfolioData) {
            const code = stock.nseCode || stock.bseCode;
            if (code && stock.currentPrice) {
              priceMap[code] = stock.currentPrice;
            }
          }

          // Create a map of stock codes to average buy prices from GridKey data
          const avgBuyPriceMap: Record<string, number> = {};
          for (const item of gridKeyData) {
            const code = item.nseCode || item.bseCode;
            if (code && item.averageBuyPrice) {
              avgBuyPriceMap[code] = item.averageBuyPrice;
            }
          }

          // Record entry data for new stocks. Always capture the date the stock
          // first appears in a GridKey upload — even if we can't find a price yet
          // (price can be filled in later on the Entry Data page).
          const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
          for (const code of newStockCodes) {
            // Use current price from portfolio, fallback to average buy price from GridKey.
            const entryPrice = priceMap[code] ?? avgBuyPriceMap[code] ?? null;
            await setEntryData(code, today, entryPrice);
            console.log(`Recorded entry data for new stock ${code}: date=${today}, price=${entryPrice ?? 'unknown'}`);
          }
        }

        // Save the GridKey data
        await Promise.all([
          saveGridKeyData(gridKeyData),
          savePrivateInvestments(
            privateInvestments?.totalInvested || 0,
            privateInvestments?.count || 0
          )
        ]);

        res.status(200).json({
          success: true,
          message: 'GridKey data saved successfully',
          newStocksDetected: newStockCodes.length,
          newStocks,
        });
      } catch (error) {
        console.error('Error saving GridKey data:', error);
        res.status(500).json({ error: 'Failed to save GridKey data' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
}

export default withAuth(handler);
