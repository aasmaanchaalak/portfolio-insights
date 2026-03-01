import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../../lib/redis';
import { verifyToken } from '../../../lib/auth';
import { User } from '../../../types/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(200).json({ authenticated: false });
    }

    const payload = await verifyToken(token);

    if (!payload) {
      return res.status(200).json({ authenticated: false });
    }

    const redis = await connectRedis();
    const session = await redis.get(`auth:sessions:${payload.sessionId}`);

    if (!session) {
      return res.status(200).json({ authenticated: false });
    }

    const userData = await redis.get(`auth:users:${payload.userId}`);
    if (!userData) {
      return res.status(200).json({ authenticated: false });
    }

    const user: User = JSON.parse(userData);

    return res.status(200).json({
      authenticated: true,
      user: { email: user.email, name: user.name },
    });
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(200).json({ authenticated: false });
  }
}
