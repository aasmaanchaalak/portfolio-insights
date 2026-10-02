import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../lib/authMiddleware';
import {
  getGridKeyData,
  saveGridKeyData,
  savePrivateInvestments,
  getPortfolioData,
  getAllEntryData,
  setEntryData,
  getFYStartPrices,
  recordRealizedExit,
} from '../../lib/queries';
import { upsertExitedWatchIdea } from '../../lib/pipeline/queries';
import { getGridKeyResponse } from '../../lib/portfolioResponse';
import { setHoldings } from '../../lib/fo/queries';
import { FO_PORTFOLIO } from '../../lib/fo/types';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        res.status(200).json(await getGridKeyResponse(authUser(req).role));
      } catch (error) {
        console.error('Error reading GridKey data:', error);
        res.status(500).json({ error: 'Failed to read GridKey data' });
      }
    } else if (req.method === 'POST') {
      try {
        const { data: gridKeyData, privateInvestments, foHoldings } = req.body;

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

        // Detect fully-exited holdings: a stock present in the previous snapshot
        // but gone from this one has been sold out. Auto-move it to the pipeline's
        // Exited-Watch stage so exits stay on the radar. GridKey is a full holdings
        // snapshot, so absence == exit (mirrors the new-stock detection above).
        const exitedStocks: { ticker: string; companyName: string }[] = [];
        try {
          const newCodes = new Set(
            gridKeyData
              .map((item: any) => item.nseCode || item.bseCode)
              .filter((code: string | null) => code)
          );
          const exitedHoldings = existingData.filter((item: any) => {
            const code = item.nseCode || item.bseCode;
            return code && !newCodes.has(code) && (Number(item.quantity) || 0) > 1;
          });

          if (exitedHoldings.length > 0) {
            const addedBy = authUser(req).name || 'System';

            // Last-known price map (exit price proxy) from the current portfolio snapshot.
            const portfolioData = await getPortfolioData() || [];
            const priceMap: Record<string, number> = {};
            for (const stock of portfolioData) {
              const code = stock.nseCode || stock.bseCode;
              if (code && stock.currentPrice) priceMap[code] = stock.currentPrice;
            }

            // Entry data + FY-start prices are used to attribute the realized gain
            // to the current financial year.
            const [entryData, fyStartPrices] = await Promise.all([
              getAllEntryData(),
              getFYStartPrices(),
            ]);
            const today = new Date().toISOString().split('T')[0];

            for (const item of exitedHoldings) {
              const ticker = item.nseCode || item.bseCode;
              const companyName = item.scripName || ticker;
              const exitPrice = priceMap[ticker] ?? item.averageBuyPrice ?? null;

              const result = await upsertExitedWatchIdea({
                ticker,
                companyName,
                addedBy,
                priceAtAdd: exitPrice,
              });
              if (result.action !== 'skipped') {
                exitedStocks.push({ ticker, companyName });
              }

              // Snapshot realized P&L inputs so this exit still feeds period returns.
              const entry = entryData[ticker] || entryData[item.nseCode] || entryData[item.bseCode] || null;
              const fyStartPrice =
                fyStartPrices[String(ticker).toUpperCase()] ??
                (item.bseCode ? fyStartPrices[String(item.bseCode).toUpperCase()] : undefined) ??
                null;
              await recordRealizedExit({
                ticker,
                companyName,
                quantity: item.quantity ?? null,
                avgBuyPrice: item.averageBuyPrice ?? null,
                exitPrice,
                exitDate: today,
                entryDate: entry?.entryDate ?? null,
                entryPrice: entry?.entryPrice ?? null,
                fyStartPrice,
              });

              console.log(`Exited holding ${ticker} → Exited-Watch (${result.action}) + realized recorded`);
            }
          }
        } catch (exitError) {
          // Never let pipeline sync break the GridKey upload.
          console.error('Error syncing exited holdings to pipeline:', exitError);
        }

        // Save the GridKey data
        await Promise.all([
          saveGridKeyData(gridKeyData),
          savePrivateInvestments(
            privateInvestments?.totalInvested || 0,
            privateInvestments?.count || 0
          )
        ]);

        // The F&O account's holdings (only in combined exports, which name each row's portfolio).
        if (Array.isArray(foHoldings)) {
          const clean = foHoldings
            .filter((h: any) => h && typeof h.name === 'string' && Number(h.quantity) > 0 && (h.nseCode || h.bseCode))
            .map((h: any) => ({ name: h.name, nseCode: h.nseCode || null, bseCode: h.bseCode || null, quantity: Number(h.quantity) }));
          await setHoldings(FO_PORTFOLIO, clean, authUser(req).name || authUser(req).email);
        }

        res.status(200).json({
          success: true,
          message: 'GridKey data saved successfully',
          newStocksDetected: newStockCodes.length,
          newStocks,
          exitedStocksDetected: exitedStocks.length,
          exitedStocks,
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
