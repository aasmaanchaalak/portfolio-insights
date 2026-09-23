import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../../lib/authMiddleware';
import { decideIdea } from '../../../../../lib/pipeline/queries';

// Bought / Pass: closes the idea with an outcome and logs the one-line reason.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { ideaId } = req.query;
  if (!ideaId || typeof ideaId !== 'string') {
    return res.status(400).json({ error: 'Idea ID is required' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { outcome, reason, actor } = req.body || {};
  if (outcome !== 'bought' && outcome !== 'passed') {
    return res.status(400).json({ error: "outcome must be 'bought' or 'passed'" });
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'reason is required' });
  }

  try {
    const idea = await decideIdea(ideaId, outcome, reason, actor || (req as AuthenticatedRequest).user.email);
    if (!idea) return res.status(404).json({ error: 'Idea not found' });
    return res.status(200).json({ idea });
  } catch (error) {
    console.error('Pipeline decision API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
