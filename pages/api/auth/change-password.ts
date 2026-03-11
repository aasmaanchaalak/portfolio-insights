import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../../lib/redis';
import { hashPassword, verifyPassword } from '../../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Email, current password, and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const redis = await connectRedis();
    const userKey = `auth:users:${email.toLowerCase().trim()}`;
    const userData = await redis.get(userKey);

    if (!userData) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = JSON.parse(userData);

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Hash new password and update
    const newPasswordHash = await hashPassword(newPassword);
    user.passwordHash = newPasswordHash;
    user.updatedAt = new Date().toISOString();

    await redis.set(userKey, JSON.stringify(user));

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
}
