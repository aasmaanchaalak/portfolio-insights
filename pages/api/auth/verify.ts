import { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken } from '../../../lib/auth';
import { getSession, getUserByEmail } from '../../../lib/queries';

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

    const session = await getSession(payload.sessionId);

    if (!session) {
      return res.status(200).json({ authenticated: false });
    }

    const user = await getUserByEmail(payload.userId);
    if (!user) {
      return res.status(200).json({ authenticated: false });
    }

    return res.status(200).json({
      authenticated: true,
      user: { email: user.email, name: user.name, role: user.role || 'analyst' },
    });
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(200).json({ authenticated: false });
  }
}
