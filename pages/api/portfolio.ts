import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import {
  getPortfolioData,
  savePortfolioData,
  getAllRemarks,
  getAllAssignments,
  getAllBuckets,
  getAllEntryData,
  getAllPositioning,
  setRemark,
  setAssignment,
  setBucket,
  setEntryData,
  setPositioning,
  deletePositioning,
  getGridKeyData,
  getUserByEmail,
  getAnalystOverrides,
  isVisibleToAnalyst,
} from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const portfolioData = await getPortfolioData();

        if (!portfolioData || portfolioData.length === 0) {
          return res.status(200).json([]);
        }

        // Fetch all metadata and GridKey in parallel
        const [remarksMap, assignmentsMap, bucketsMap, entryDataMap, positioningMap, gridKey] = await Promise.all([
          getAllRemarks(),
          getAllAssignments(),
          getAllBuckets(),
          getAllEntryData(),
          getAllPositioning(),
          getGridKeyData(),
        ]);

        // Build GridKey lookup by stock code
        const gridKeyByCode: Record<string, { quantity: number | null; averageBuyPrice: number | null }> = {};
        for (const item of gridKey || []) {
          const code = item.nseCode || item.bseCode;
          if (!code) continue;
          gridKeyByCode[code] = {
            quantity: item.quantity != null ? Number(item.quantity) : null,
            averageBuyPrice: item.averageBuyPrice != null ? Number(item.averageBuyPrice) : null,
          };
        }

        // First pass: merge metadata, GridKey, and per-stock computed fields
        const firstPass = portfolioData.map((stock: any) => {
          const code = stock.nseCode || stock.bseCode;
          const entryData = code && entryDataMap[code] ? entryDataMap[code] : null;
          const gk = code && gridKeyByCode[code] ? gridKeyByCode[code] : { quantity: null, averageBuyPrice: null };
          const currentPrice = stock.currentPrice ? Number(stock.currentPrice) : null;
          const calculatedAmount = (gk.quantity != null && currentPrice != null) ? gk.quantity * currentPrice : null;
          const investedAmount = (gk.quantity != null && gk.averageBuyPrice != null) ? gk.quantity * gk.averageBuyPrice : null;
          const absoluteGain = (calculatedAmount != null && investedAmount != null) ? calculatedAmount - investedAmount : null;
          const gainPercentage = (investedAmount != null && investedAmount > 0 && absoluteGain != null) ? (absoluteGain / investedAmount) * 100 : null;
          const dma50 = stock.dma50 ? Number(stock.dma50) : null;
          const dma200 = stock.dma200 ? Number(stock.dma200) : null;
          const dma50ChangePercent = (currentPrice != null && dma50 != null && dma50 !== 0) ? ((currentPrice - dma50) / dma50) * 100 : null;
          const dma200ChangePercent = (currentPrice != null && dma200 != null && dma200 !== 0) ? ((currentPrice - dma200) / dma200) * 100 : null;
          return {
            ...stock,
            quantity: gk.quantity,
            averageBuyPrice: gk.averageBuyPrice,
            calculatedAmount,
            investedAmount,
            absoluteGain,
            gainPercentage,
            dma50ChangePercent,
            dma200ChangePercent,
            remarks: code && remarksMap[code] ? remarksMap[code] : null,
            assignedTo: code && assignmentsMap[code] ? assignmentsMap[code] : null,
            bucket: code && bucketsMap[code] ? bucketsMap[code] : null,
            entryDate: entryData ? entryData.entryDate : null,
            entryPrice: entryData ? entryData.entryPrice : null,
            positioning: code && positioningMap[code] ? positioningMap[code] : null
          };
        });

        // Second pass: compute weightage and portfolioContribution using total portfolio value
        const totalPortfolioValue = firstPass.reduce((sum: number, s: any) => sum + (s.calculatedAmount || 0), 0);
        const enrichedData = firstPass.map((stock: any) => {
          const weightage = totalPortfolioValue > 0 && stock.calculatedAmount != null
            ? (stock.calculatedAmount / totalPortfolioValue) * 100
            : null;
          const ytdReturn = stock.return1Y ?? stock.return6M ?? stock.return3M ?? null;
          const portfolioContribution = (ytdReturn != null && weightage != null) ? (ytdReturn * weightage) / 100 : null;
          return { ...stock, weightage, portfolioContribution };
        });

        const userEmail = (req as any).user?.email;
        const user = userEmail ? await getUserByEmail(userEmail) : null;
        let visibleData = enrichedData;
        if (user?.role === 'analyst') {
          const overrides = await getAnalystOverrides();
          visibleData = enrichedData.filter((stock: any) => {
            const code = stock.nseCode || stock.bseCode;
            if (!code) return true;
            const invested = stock.investedAmount || 0;
            return isVisibleToAnalyst(invested, code, overrides);
          });
        }

        res.status(200).json(visibleData);
      } catch (error) {
        console.error('Error reading portfolio data:', error);
        res.status(500).json({ error: 'Failed to read portfolio data' });
      }
    } else if (req.method === 'POST') {
      try {
        const { data: portfolioData } = req.body;

        if (!Array.isArray(portfolioData)) {
          return res.status(400).json({ error: 'Data must be an array' });
        }

        // Process portfolio data and save metadata
        const cleanedData = await Promise.all(portfolioData.map(async (stock: any) => {
          const code = stock.nseCode || stock.bseCode;

          if (code) {
            // Handle remarks
            if (stock.remarks !== undefined) {
              await setRemark(code, stock.remarks || null);
            }

            // Handle assignments
            if (stock.assignedTo !== undefined) {
              await setAssignment(code, stock.assignedTo || null);
            }

            // Handle buckets
            if (stock.bucket !== undefined) {
              await setBucket(code, stock.bucket || null);
            }

            // Handle entry data
            if (stock.entryDate !== undefined || stock.entryPrice !== undefined) {
              await setEntryData(code, stock.entryDate || null, stock.entryPrice || null);
            }

            // Handle positioning
            if (stock.positioning !== undefined) {
              if (stock.positioning === null) {
                await deletePositioning(code);
              } else {
                await setPositioning(code, stock.positioning);
              }
            }
          }

          // Remove metadata fields from stock data before storing
          const { remarks, assignedTo, bucket, entryDate, entryPrice, positioning, ...stockWithoutExtras } = stock;
          return stockWithoutExtras;
        }));

        await savePortfolioData(cleanedData);
        res.status(200).json({ success: true, message: 'Portfolio data updated successfully' });
      } catch (error) {
        console.error('Error updating portfolio data:', error);
        res.status(500).json({ error: 'Failed to update portfolio data' });
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
