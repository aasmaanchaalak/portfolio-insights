import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getAllEntryData, setEntryData, bulkSetEntryData } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const entryData = await getAllEntryData();
        res.status(200).json(entryData);
      } catch (error) {
        console.error('Error reading entry data:', error);
        res.status(500).json({ error: 'Failed to read entry data' });
      }
    } else if (req.method === 'POST') {
      try {
        const { code, entryDate, entryPrice } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        if (!entryDate || entryPrice === undefined) {
          return res.status(400).json({ error: 'Entry date and price are required' });
        }

        await setEntryData(code, entryDate, entryPrice);
        res.status(200).json({ success: true, message: 'Entry data saved successfully' });
      } catch (error) {
        console.error('Error saving entry data:', error);
        res.status(500).json({ error: 'Failed to save entry data' });
      }
    } else if (req.method === 'PUT') {
      try {
        const { entries } = req.body;

        if (!Array.isArray(entries)) {
          return res.status(400).json({ error: 'Entries must be an array' });
        }

        const validEntries = entries
          .filter((entry: any) => entry.code && entry.entryDate && entry.entryPrice !== undefined)
          .map((entry: any) => ({
            stockCode: entry.code,
            entryDate: entry.entryDate,
            entryPrice: entry.entryPrice,
          }));

        await bulkSetEntryData(validEntries);
        res.status(200).json({ success: true, message: `${validEntries.length} entry records saved` });
      } catch (error) {
        console.error('Error bulk saving entry data:', error);
        res.status(500).json({ error: 'Failed to save entry data' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'PUT']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
}

export default withAuth(handler);
