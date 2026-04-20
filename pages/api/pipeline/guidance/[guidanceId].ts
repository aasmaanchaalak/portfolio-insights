import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../../lib/authMiddleware';
import { updateGuidance, deleteGuidance } from '../../../../lib/pipeline/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { guidanceId } = req.query;

  if (!guidanceId || typeof guidanceId !== 'string') {
    return res.status(400).json({ error: 'Guidance ID is required' });
  }

  try {
    switch (method) {
      case 'PUT': {
        const updated = await updateGuidance(guidanceId, req.body);
        if (!updated) return res.status(404).json({ error: 'Guidance entry not found' });
        return res.status(200).json({ guidance: updated });
      }

      case 'DELETE': {
        const deleted = await deleteGuidance(guidanceId);
        if (!deleted) return res.status(404).json({ error: 'Guidance entry not found' });
        return res.status(200).json({ success: true });
      }

      default:
        res.setHeader('Allow', ['PUT', 'DELETE']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Guidance API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
