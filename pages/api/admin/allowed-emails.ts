import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, AuthenticatedRequest } from '../../../lib/authMiddleware';
import { getAllowedEmails, addAllowedEmail, removeAllowedEmail } from '../../../lib/queries';

const ADMIN_EMAIL = 'aditya@saguncapital.com';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userEmail = (req as AuthenticatedRequest).user.email;

  if (!userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Only admin can access this endpoint
  if (userEmail !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }

  try {
    if (req.method === 'GET') {
      const emails = await getAllowedEmails();
      return res.status(200).json(emails);
    }

    if (req.method === 'POST') {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      try {
        const allowedEmail = await addAllowedEmail(email, userEmail);
        return res.status(201).json(allowedEmail);
      } catch (err) {
        if (err instanceof Error && err.message === 'Email already in allowlist') {
          return res.status(409).json({ error: 'Email already in allowlist' });
        }
        throw err;
      }
    }

    if (req.method === 'DELETE') {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Prevent removing admin email
      if (email.toLowerCase() === ADMIN_EMAIL) {
        return res.status(400).json({ error: 'Cannot remove admin email' });
      }

      const deleted = await removeAllowedEmail(email);
      if (!deleted) {
        return res.status(404).json({ error: 'Email not found in allowlist' });
      }

      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('Allowed emails API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
