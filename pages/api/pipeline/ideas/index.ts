import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../lib/authMiddleware';
import { listIdeas, createIdea } from '../../../../lib/pipeline/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET': {
        const ideas = await listIdeas();
        return res.status(200).json({ ideas });
      }

      case 'POST': {
        const { ticker, companyName, addedBy, assignedTo, source, whyInteresting,
          priceAtAdd, status, priority, decision, decisionReason, triggerCondition, dateAdded } = req.body;

        if (!ticker || !companyName || !addedBy) {
          return res.status(400).json({ error: 'ticker, companyName, and addedBy are required' });
        }

        const idea = await createIdea({
          ticker, companyName, addedBy, assignedTo, source, whyInteresting,
          priceAtAdd, status, priority, decision, decisionReason, triggerCondition, dateAdded,
        });
        return res.status(201).json({ idea });
      }

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Pipeline ideas API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
