import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getCompanyById, getThesis, getThesisHistory } from '../../../../lib/pe/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { companyId, limit = '50', offset = '0' } = req.query;

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ error: 'Company ID is required' });
  }

  if (method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${method} Not Allowed` });
  }

  try {
    // Verify company exists
    const company = await getCompanyById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const thesis = await getThesis(companyId);
    if (!thesis) {
      return res.status(200).json({ history: [] });
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 100);
    const offsetNum = parseInt(offset as string, 10) || 0;

    const history = await getThesisHistory(thesis.id, limitNum, offsetNum);

    return res.status(200).json({ history });
  } catch (error) {
    console.error('PE Thesis History API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
