import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../lib/authMiddleware';
import {
  getCompanyById,
  getCommunications,
  createCommunication,
  updateCommunication,
  deleteCommunication,
} from '../../../../lib/pe/queries';
import { isAdmin } from '../../../../lib/pe/accessControl';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { companyId, communicationId, limit = '50', offset = '0' } = req.query;
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
        const limitNum = Math.min(parseInt(limit as string, 10) || 50, 100);
        const offsetNum = parseInt(offset as string, 10) || 0;

        const communications = await getCommunications(companyId, limitNum, offsetNum);
        return res.status(200).json({ communications });
      }

      case 'POST': {
        const {
          communicationType = 'note',
          subject,
          summary,
          detailedNotes,
          communicationDate,
          participants,
          followUpRequired,
          followUpDate,
          followUpNotes,
        } = req.body;

        // Use current date if not provided
        const effectiveDate = communicationDate || new Date().toISOString();

        const communication = await createCommunication(
          companyId,
          {
            communicationType,
            subject,
            summary,
            detailedNotes,
            communicationDate: effectiveDate,
            participants,
            followUpRequired,
            followUpDate,
            followUpNotes,
          },
          userEmail
        );

        return res.status(201).json({ communication });
      }

      case 'PUT': {
        if (!communicationId || typeof communicationId !== 'string') {
          return res.status(400).json({ error: 'Communication ID is required' });
        }

        const {
          communicationType,
          subject,
          summary,
          detailedNotes,
          communicationDate,
          participants,
          followUpRequired,
          followUpDate,
          followUpNotes,
        } = req.body;

        const communication = await updateCommunication(communicationId, {
          communicationType,
          subject,
          summary,
          detailedNotes,
          communicationDate,
          participants,
          followUpRequired,
          followUpDate,
          followUpNotes,
        });

        if (!communication) {
          return res.status(404).json({ error: 'Communication not found' });
        }

        return res.status(200).json({ communication });
      }

      case 'DELETE': {
        if (!isAdmin(userEmail)) {
          return res.status(403).json({ error: 'Only admin can delete communications' });
        }
        if (!communicationId || typeof communicationId !== 'string') {
          return res.status(400).json({ error: 'Communication ID is required' });
        }

        const deleted = await deleteCommunication(communicationId);

        if (!deleted) {
          return res.status(404).json({ error: 'Communication not found' });
        }

        return res.status(200).json({ success: true });
      }

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('PE Communications API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
