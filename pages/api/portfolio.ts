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
} from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const portfolioData = await getPortfolioData();

        if (!portfolioData || portfolioData.length === 0) {
          return res.status(200).json([]);
        }

        // Fetch all metadata in parallel
        const [remarksMap, assignmentsMap, bucketsMap, entryDataMap, positioningMap] = await Promise.all([
          getAllRemarks(),
          getAllAssignments(),
          getAllBuckets(),
          getAllEntryData(),
          getAllPositioning(),
        ]);

        // Merge metadata into portfolio data
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
