import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../../lib/authMiddleware';
import { getNotesByIdea, createNote } from '../../../../../lib/pipeline/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { ideaId } = req.query;
  const userEmail = (req as AuthenticatedRequest).user.email;

  if (!ideaId || typeof ideaId !== 'string') {
    return res.status(400).json({ error: 'Idea ID is required' });
  }

  try {
    switch (method) {
      case 'GET': {
        const notes = await getNotesByIdea(ideaId);
        return res.status(200).json({ notes });
      }

      case 'POST': {
        const { noteText, addedBy } = req.body;
        if (!noteText) return res.status(400).json({ error: 'noteText is required' });
        const note = await createNote(ideaId, noteText, addedBy || userEmail);
        return res.status(201).json({ note });
      }

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Pipeline notes API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
