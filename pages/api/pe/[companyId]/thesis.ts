import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getCompanyById, updateThesis } from '../../../../lib/pe/queries';

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
        return res.status(200).json({ company });
      }

      case 'PUT': {
        const { status, originalThesis, keyDrivers, latestNote, breakConditions } = req.body;
        const updated = await updateThesis(companyId, { status, originalThesis, keyDrivers, latestNote, breakConditions });
        return res.status(200).json({ company: updated });
      }

      default:
        res.setHeader('Allow', ['GET', 'PUT']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('PE Thesis API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
