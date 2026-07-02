import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { getCompanyById, updateExit } from '../../../../lib/pe/queries';
import { calculateMetrics } from '../../../../lib/pe/calculations';

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
      case 'PUT': {
        const { isExited, exitDate, exitValue } = req.body;

        if (typeof isExited !== 'boolean') {
          return res.status(400).json({ error: 'isExited must be a boolean' });
        }
        if (isExited && exitValue != null && (typeof exitValue !== 'number' || exitValue < 0)) {
          return res.status(400).json({ error: 'exitValue must be a non-negative number' });
        }

        const updated = await updateExit(companyId, { isExited, exitDate, exitValue });
        const metrics = calculateMetrics(updated);
        return res.status(200).json({ company: updated, metrics });
      }

      default:
        res.setHeader('Allow', ['PUT']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('PE Exit API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
