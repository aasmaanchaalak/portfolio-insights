import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../../../lib/authMiddleware';
import { getThesisByStockCode, getNotesByThesisId, addNote } from '../../../../../lib/thesis/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { stockCode } = req.query;
  const userEmail = (req as AuthenticatedRequest).user?.email;

  if (!stockCode || typeof stockCode !== 'string') {
    return res.status(400).json({ error: 'Stock code is required' });
  }

  try {
    if (req.method === 'GET') {
      const thesis = await getThesisByStockCode(stockCode);
      const notes = thesis ? await getNotesByThesisId(thesis.id) : [];
      return res.status(200).json({ notes });
    }

    if (req.method === 'POST') {
      const { content } = req.body;
      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ error: 'Note content is required' });
      }
      const notes = await addNote(stockCode, content.trim(), userEmail);
      return res.status(201).json({ notes });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: any) {
    if (error?.message === 'Thesis not found') {
      return res.status(404).json({ error: 'Thesis not found' });
    }
    console.error('Error handling thesis notes request:', error);
    return res.status(500).json({ error: 'Failed to process request' });
  }
}

export default withAuth(handler);
