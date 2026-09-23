import { NextApiRequest, NextApiResponse } from 'next';
import { authenticate } from '../../../lib/authMiddleware';
import { getUserByEmail } from '../../../lib/queries';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Falls back to the refresh token (and renews) when the access token lapsed.
    const auth = await authenticate(req, res);

    if (!auth) {
      return res.status(200).json({ authenticated: false });
    }

    const user = await getUserByEmail(auth.email);
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
