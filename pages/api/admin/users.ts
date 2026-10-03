import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../../lib/authMiddleware';
import { getAllUsers, updateUserRole, getUserByEmail, deleteUser, deleteUserSessions, clearUserDevice, setUserAdmin, setUserDeviceLockExempt, UserRole } from '../../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { email: userEmail, isAdmin } = authUser(req);

    // Only admin can access this endpoint
    if (!isAdmin) {
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

        // Exempt an account from device locking (or lock it again). Logs the
        // user out so their next login follows the new setting.
        if (action === 'set-device-lock-exempt') {
          const { exempt } = req.body;
          if (!email || typeof exempt !== 'boolean') {
            return res.status(400).json({ error: 'Email and exempt are required' });
          }
          const target = await getUserByEmail(email);
          if (!target) {
            return res.status(404).json({ error: 'User not found' });
          }
          await setUserDeviceLockExempt(email, exempt);
          await deleteUserSessions(email);
          return res.status(200).json({ success: true });
        }

        // Grant or revoke admin. You can't revoke your own, so there's always one admin left.
        if (action === 'set-admin') {
          const { isAdmin: makeAdmin } = req.body;
          if (!email || typeof makeAdmin !== 'boolean') {
            return res.status(400).json({ error: 'Email and isAdmin are required' });
          }
          if (email === userEmail && !makeAdmin) {
            return res.status(400).json({ error: 'You cannot remove your own admin access' });
          }
          const target = await getUserByEmail(email);
          if (!target) {
            return res.status(404).json({ error: 'User not found' });
          }
          await setUserAdmin(email, makeAdmin);
          return res.status(200).json({ success: true });
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
        if (email === userEmail) {
          return res.status(400).json({ error: 'Cannot change your own role' });
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

        // Admin accounts must be demoted before they can be deleted
        if (user.isAdmin) {
          return res.status(400).json({ error: 'Cannot delete an admin account. Remove admin access first.' });
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
