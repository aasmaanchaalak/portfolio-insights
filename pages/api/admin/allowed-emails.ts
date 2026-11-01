import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/authMiddleware';
import { getAllowedEmails, addAllowedEmail, removeAllowedEmail, getUserByEmail, setAllowedEmailRole, isUserRole } from '../../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userEmail = (req as AuthenticatedRequest).user.email;

  // Only admin can access this endpoint
  if (!(req as AuthenticatedRequest).user.isAdmin) {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }

  try {
    if (req.method === 'GET') {
      const emails = await getAllowedEmails();
      return res.status(200).json(emails);
    }

    if (req.method === 'POST') {
      const { email, role = 'analyst' } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }
      if (!isUserRole(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      try {
        const allowedEmail = await addAllowedEmail(email, userEmail, role);
        return res.status(201).json(allowedEmail);
      } catch (err) {
        if (err instanceof Error && err.message === 'Email already in allowlist') {
          return res.status(409).json({ error: 'Email already in allowlist' });
        }
        throw err;
      }
    }

    // Change the role a pending email will register with.
    if (req.method === 'PATCH') {
      const { email, role } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }
      if (!isUserRole(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      const updated = await setAllowedEmailRole(email, role);
      if (!updated) {
        return res.status(404).json({ error: 'Email not found in allowlist' });
      }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Prevent removing an admin's email
      const target = await getUserByEmail(email.toLowerCase());
      if (target?.isAdmin) {
        return res.status(400).json({ error: 'Cannot remove admin email' });
      }

      const deleted = await removeAllowedEmail(email);
      if (!deleted) {
        return res.status(404).json({ error: 'Email not found in allowlist' });
      }

      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('Allowed emails API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
