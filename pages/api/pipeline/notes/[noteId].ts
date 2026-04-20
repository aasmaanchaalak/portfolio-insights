import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { deleteNote } from '../../../../lib/pipeline/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { noteId } = req.query;

  if (!noteId || typeof noteId !== 'string') {
    return res.status(400).json({ error: 'Note ID is required' });
  }

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const deleted = await deleteNote(noteId);
    if (!deleted) return res.status(404).json({ error: 'Note not found' });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Pipeline note delete error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
