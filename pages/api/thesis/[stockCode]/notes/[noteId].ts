import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../../lib/authMiddleware';
import { updateNote, deleteNote } from '../../../../../lib/thesis/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { noteId } = req.query;

  if (!noteId || typeof noteId !== 'string') {
    return res.status(400).json({ error: 'Note ID is required' });
  }

  try {
    if (req.method === 'PUT') {
      const { content } = req.body;
      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ error: 'Note content is required' });
      }
      const notes = await updateNote(noteId, content.trim());
      if (!notes) return res.status(404).json({ error: 'Note not found' });
      return res.status(200).json({ notes });
    }

    if (req.method === 'DELETE') {
      const notes = await deleteNote(noteId);
      if (!notes) return res.status(404).json({ error: 'Note not found' });
      return res.status(200).json({ notes });
    }

    res.setHeader('Allow', ['PUT', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error('Error handling thesis note request:', error);
    return res.status(500).json({ error: 'Failed to process request' });
  }
}

export default withAuth(handler);
