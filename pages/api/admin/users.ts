import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { getAllUsers, updateUserRole, getUserByEmail, deleteUser, deleteUserSessions, clearUserDevice, UserRole } from '../../../lib/queries';

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
        const { email, role, action } = req.body;

        // Reset device lock: clears the bound device and logs the user out so
        // they can re-bind on their next login (e.g. new laptop / cleared cookies).
        if (action === 'reset-device') {
          if (!email) {
            return res.status(400).json({ error: 'Email is required' });
          }
          const target = await getUserByEmail(email);
          if (!target) {
            return res.status(404).json({ error: 'User not found' });
          }
          await clearUserDevice(email);
          await deleteUserSessions(email);
          return res.status(200).json({ success: true, message: 'Device lock reset' });
        }

        if (!email || !role) {
          return res.status(400).json({ error: 'Email and role are required' });
        }

        // Validate role
        if (role !== 'portfolio' && role !== 'analyst' && role !== 'manager') {
          return res.status(400).json({ error: 'Invalid role. Must be "portfolio", "analyst", or "manager"' });
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
    } else if (req.method === 'DELETE') {
      try {
        const { email } = req.body;

        if (!email) {
          return res.status(400).json({ error: 'Email is required' });
        }

        // Check if user exists
        const user = await getUserByEmail(email);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Prevent admin from deleting themselves
        if (email === ADMIN_EMAIL) {
          return res.status(400).json({ error: 'Cannot delete admin account' });
        }

        await deleteUserSessions(email);
        await deleteUser(email);
        res.status(200).json({ success: true, message: 'User deleted successfully' });
      } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Admin API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
