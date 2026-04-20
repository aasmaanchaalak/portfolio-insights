import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getCompanyById, getValuation, upsertValuation } from '../../../../lib/pe/queries';
import { ValuationTableData } from '../../../../types/pe';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { companyId } = req.query;

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ error: 'Company ID is required' });
  }

  try {
    const company = await getCompanyById(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    switch (method) {
      case 'GET': {
        const tableData = await getValuation(companyId);
        return res.status(200).json({ tableData });
      }

      case 'PUT': {
        const { tableData } = req.body as { tableData: ValuationTableData };
        if (!tableData || typeof tableData !== 'object') {
          return res.status(400).json({ error: 'tableData is required' });
        }
        const saved = await upsertValuation(companyId, tableData);
        return res.status(200).json({ tableData: saved });
      }

      default:
        res.setHeader('Allow', ['GET', 'PUT']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('PE Valuation API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
