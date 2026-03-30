import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../lib/authMiddleware';
import { getCompanyById, getBroker, upsertBroker, deleteBroker } from '../../../../lib/pe/queries';
import { sanitizeBroker, canModifySensitiveData } from '../../../../lib/pe/accessControl';

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
        const broker = await getBroker(companyId);
        const sanitizedBroker = sanitizeBroker(broker, userEmail);
        return res.status(200).json({ broker: sanitizedBroker });
      }

      case 'PUT': {
        // Only admin can update broker info
        if (!canModifySensitiveData(userEmail)) {
          return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }

        const { brokerName, brokerFirm, brokerEmail, brokerPhone, notes } = req.body;

        if (!brokerName) {
          return res.status(400).json({ error: 'Broker name is required' });
        }

        const broker = await upsertBroker(companyId, {
          brokerName,
          brokerFirm,
          brokerEmail,
          brokerPhone,
          notes,
        });

        return res.status(200).json({ broker });
      }

      case 'DELETE': {
        // Only admin can delete broker info
        if (!canModifySensitiveData(userEmail)) {
          return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }

        const deleted = await deleteBroker(companyId);

        if (!deleted) {
          return res.status(404).json({ error: 'Broker not found' });
        }

        return res.status(200).json({ success: true });
      }

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('PE Broker API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
