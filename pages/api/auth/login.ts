import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import {
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  generateSessionId,
  getSessionExpiry,
  ACCESS_COOKIE_OPTIONS,
  REFRESH_COOKIE_OPTIONS,
} from '../../../lib/auth';
import { getUserByEmail, createSession, updateUserLastLogin } from '../../../lib/queries';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sessionId = generateSessionId();
    const expiresAt = new Date(getSessionExpiry());

    await createSession(sessionId, normalizedEmail, expiresAt);
    await updateUserLastLogin(normalizedEmail);

    const accessToken = await createAccessToken(normalizedEmail, sessionId);
    const refreshToken = await createRefreshToken(normalizedEmail, sessionId);

    res.setHeader('Set-Cookie', [
      serialize('accessToken', accessToken, ACCESS_COOKIE_OPTIONS),
      serialize('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS),
    ]);

    return res.status(200).json({
      success: true,
      user: { email: user.email, name: user.name },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}
