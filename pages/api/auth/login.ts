import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { connectRedis } from '../../../lib/redis';
import {
  verifyPassword,
  createAccessToken,
  createRefreshToken,
  generateSessionId,
  getSessionExpiry,
  ACCESS_COOKIE_OPTIONS,
  REFRESH_COOKIE_OPTIONS,
} from '../../../lib/auth';
import { User, Session } from '../../../types/auth';

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
    const redis = await connectRedis();

    const userData = await redis.get(`auth:users:${normalizedEmail}`);
    if (!userData) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user: User = JSON.parse(userData);

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sessionId = generateSessionId();
    const session: Session = {
      userId: normalizedEmail,
      createdAt: new Date().toISOString(),
      expiresAt: getSessionExpiry(),
    };

    await redis.set(`auth:sessions:${sessionId}`, JSON.stringify(session));
    await redis.expire(`auth:sessions:${sessionId}`, 7 * 24 * 60 * 60);

    user.lastLoginAt = new Date().toISOString();
    await redis.set(`auth:users:${normalizedEmail}`, JSON.stringify(user));

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
