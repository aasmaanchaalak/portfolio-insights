import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../../lib/redis';
import { hashPassword, isEmailAllowed } from '../../../lib/auth';
import { User } from '../../../types/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!isEmailAllowed(normalizedEmail)) {
      return res.status(403).json({ error: 'This email is not authorized to register' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const redis = await connectRedis();

    const existingUser = await redis.get(`auth:users:${normalizedEmail}`);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);

    const user: User = {
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    };

    await redis.set(`auth:users:${normalizedEmail}`, JSON.stringify(user));

    return res.status(201).json({ success: true, message: 'Registration successful' });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
}
