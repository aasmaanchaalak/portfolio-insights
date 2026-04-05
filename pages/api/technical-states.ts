import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getTechnicalStates, saveTechnicalStates, TechnicalState } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const states = await getTechnicalStates();
        res.status(200).json(states);
      } catch (error) {
        console.error('Error reading technical states:', error);
        res.status(500).json({ error: 'Failed to read technical states' });
      }
    } else if (req.method === 'POST') {
      try {
        const { states } = req.body;

        if (!Array.isArray(states)) {
          return res.status(400).json({ error: 'States must be an array' });
        }

        const technicalStates: TechnicalState[] = states.map((state: any) => ({
          stockCode: state.stockCode,
          stockName: state.stockName,
          above50DMA: state.above50DMA,
          above200DMA: state.above200DMA,
          dma50Above200: state.dma50Above200,
          near52WeekHigh: state.near52WeekHigh,
          near52WeekLow: state.near52WeekLow,
          profitGrowthAbove15: state.profitGrowthAbove15,
          salesGrowthAbove15: state.salesGrowthAbove15,
          timestamp: state.timestamp || new Date().toISOString(),
        }));

        await saveTechnicalStates(technicalStates);
        res.status(200).json({ success: true, message: 'Technical states saved successfully' });
      } catch (error) {
        console.error('Error saving technical states:', error);
        res.status(500).json({ error: 'Failed to save technical states' });
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
