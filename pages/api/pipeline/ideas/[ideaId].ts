import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
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

      case 'PUT': {
        const updated = await updateIdea(ideaId, req.body, existing.status);
        return res.status(200).json({ idea: updated });
      }

      case 'DELETE': {
        await deleteIdea(ideaId);
        return res.status(200).json({ success: true });
      }

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Pipeline idea API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
