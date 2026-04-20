import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { getTeamMembers, addTeamMember, deleteTeamMember } from '../../../lib/queries';

const ADMIN_EMAIL = 'aditya@saguncapital.com';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userEmail = (req as any).user?.email;
  if (userEmail !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }

  try {
    switch (req.method) {
      case 'GET': {
        const members = await getTeamMembers();
        return res.status(200).json(members);
      }
      case 'POST': {
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
        const member = await addTeamMember(name);
        return res.status(201).json(member);
      }
      case 'DELETE': {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID is required' });
        const deleted = await deleteTeamMember(id);
        if (!deleted) return res.status(404).json({ error: 'Member not found' });
        return res.status(200).json({ success: true });
      }
      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('Team members API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
