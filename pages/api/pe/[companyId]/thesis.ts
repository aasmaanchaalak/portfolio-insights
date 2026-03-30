import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../lib/authMiddleware';
import {
  getCompanyById,
  getThesis,
  getThesisBreakConditions,
  updateThesis,
} from '../../../../lib/pe/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { companyId } = req.query;
  const userEmail = (req as AuthenticatedRequest).user.email;

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ error: 'Company ID is required' });
  }

  try {
    // Verify company exists
    const company = await getCompanyById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    switch (method) {
      case 'GET': {
        const thesis = await getThesis(companyId);

        if (!thesis) {
          return res.status(200).json({
            thesis: null,
            breakConditions: [],
          });
        }

        const breakConditions = await getThesisBreakConditions(thesis.id);

        return res.status(200).json({
          thesis,
          breakConditions,
        });
      }

      case 'PUT': {
        const { status, originalThesis, keyDrivers, latestNote, breakConditions } = req.body;

        const thesis = await updateThesis(
          companyId,
          { status, originalThesis, keyDrivers, latestNote, breakConditions },
          userEmail
        );

        const updatedBreakConditions = await getThesisBreakConditions(thesis.id);

        return res.status(200).json({
          thesis,
          breakConditions: updatedBreakConditions,
        });
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
