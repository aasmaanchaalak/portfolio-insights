import { NextApiRequest, NextApiResponse } from 'next';
import { hashPassword, isEmailAllowed } from '../../../lib/auth';
import { getUserByEmail, createUser } from '../../../lib/queries';

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

    const existingUser = await getUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    await createUser(normalizedEmail, passwordHash, name.trim());

    return res.status(201).json({ success: true, message: 'Registration successful' });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
}
