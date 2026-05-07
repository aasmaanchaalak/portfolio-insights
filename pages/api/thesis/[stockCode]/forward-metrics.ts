import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getForwardMetrics, upsertForwardMetrics } from '../../../../lib/thesis/queries';
import { ValuationTableData } from '../../../../types/pe';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { stockCode } = req.query;

  if (!stockCode || typeof stockCode !== 'string') {
    return res.status(400).json({ error: 'Stock code is required' });
  }

  try {
    if (req.method === 'GET') {
      const tableData = await getForwardMetrics(stockCode);
      return res.status(200).json({ tableData });
    }

    if (req.method === 'PUT') {
      const { tableData } = req.body as { tableData: ValuationTableData };
      if (!tableData || typeof tableData !== 'object') {
        return res.status(400).json({ error: 'tableData is required' });
      }
      const saved = await upsertForwardMetrics(stockCode, tableData);
      return res.status(200).json({ tableData: saved });
    }

    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('Forward metrics API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
