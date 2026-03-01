import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { connectRedis } from '../../../lib/redis';
import { verifyToken, createAccessToken, ACCESS_COOKIE_OPTIONS } from '../../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const payload = await verifyToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const redis = await connectRedis();
    const session = await redis.get(`auth:sessions:${payload.sessionId}`);

    if (!session) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const accessToken = await createAccessToken(payload.userId, payload.sessionId);

    res.setHeader('Set-Cookie', serialize('accessToken', accessToken, ACCESS_COOKIE_OPTIONS));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Refresh error:', error);
    return res.status(500).json({ error: 'Token refresh failed' });
  }
}
