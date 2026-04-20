import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getCompanyById, updateCompany, deleteCompany } from '../../../../lib/pe/queries';
import { calculateMetrics } from '../../../../lib/pe/calculations';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { companyId } = req.query;

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ error: 'Company ID is required' });
  }

  try {
    switch (method) {
      case 'GET': {
        const company = await getCompanyById(companyId);
        if (!company) return res.status(404).json({ error: 'Company not found' });
        const metrics = calculateMetrics(company);
        return res.status(200).json({ company, metrics });
      }

      case 'PUT': {
        const { companyName, companyCode, sector, subSector, website, description } = req.body;
        const company = await updateCompany(companyId, { companyName, companyCode, sector, subSector, website, description });
        if (!company) return res.status(404).json({ error: 'Company not found' });
        return res.status(200).json(company);
      }

      case 'DELETE': {
        const deleted = await deleteCompany(companyId);
        if (!deleted) return res.status(404).json({ error: 'Company not found' });
        return res.status(200).json({ success: true });
      }

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('PE Company API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
