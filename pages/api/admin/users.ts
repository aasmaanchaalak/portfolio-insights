import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { getAllUsers, updateUserRole, getUserByEmail, UserRole } from '../../../lib/queries';

const ADMIN_EMAIL = 'aditya@saguncapital.com';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get the current user from the auth middleware
    const userEmail = (req as any).user?.email;

    if (!userEmail) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Only admin can access this endpoint
    if (userEmail !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    if (req.method === 'GET') {
      try {
        const users = await getAllUsers();
        res.status(200).json(users);
      } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
      }
    } else if (req.method === 'PUT') {
      try {
        const { email, role } = req.body;

        if (!email || !role) {
          return res.status(400).json({ error: 'Email and role are required' });
        }

        // Validate role
        if (role !== 'portfolio' && role !== 'analyst') {
          return res.status(400).json({ error: 'Invalid role. Must be "portfolio" or "analyst"' });
        }

        // Check if user exists
        const user = await getUserByEmail(email);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Prevent admin from changing their own role
        if (email === ADMIN_EMAIL) {
          return res.status(400).json({ error: 'Cannot change admin role' });
        }

        await updateUserRole(email, role as UserRole);
        res.status(200).json({ success: true, message: 'Role updated successfully' });
      } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ error: 'Failed to update user role' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'PUT']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Admin API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
