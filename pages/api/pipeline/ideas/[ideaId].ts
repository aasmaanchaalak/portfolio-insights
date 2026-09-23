import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../lib/authMiddleware';
import { getIdeaById, updateIdea, deleteIdea } from '../../../../lib/pipeline/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { ideaId } = req.query;

  if (!ideaId || typeof ideaId !== 'string') {
    return res.status(400).json({ error: 'Idea ID is required' });
  }

  try {
    const existing = await getIdeaById(ideaId);
    if (!existing) return res.status(404).json({ error: 'Idea not found' });

    switch (method) {
      case 'GET':
        return res.status(200).json({ idea: existing });

      case 'PUT':
      case 'PATCH': {
        const { companyName, why, owner, priority, stage, tag, alert, actor } = req.body || {};
        if (stage !== undefined && !['new', 'research', 'waiting', 'closed'].includes(stage)) {
          return res.status(400).json({ error: 'Invalid stage' });
        }
        if (priority !== undefined && !['high', 'medium', 'low'].includes(priority)) {
          return res.status(400).json({ error: 'Invalid priority' });
        }
        if (alert !== undefined && alert !== null) {
          const okPrice = alert.type === 'price' && Number(alert.value) > 0;
          const okEvent = alert.type === 'event' && typeof alert.text === 'string';
          if (!okPrice && !okEvent) return res.status(400).json({ error: 'Invalid alert' });
        }
        const updated = await updateIdea(
          ideaId,
          { companyName, why, owner, priority, stage, tag, alert },
          actor || (req as AuthenticatedRequest).user.email,
        );
        return res.status(200).json({ idea: updated });
      }

      case 'DELETE': {
        await deleteIdea(ideaId);
        return res.status(200).json({ success: true });
      }

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'PATCH', 'DELETE']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Pipeline idea API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
