import { NextApiRequest, NextApiResponse } from 'next';
import { authenticate } from '../../../lib/authMiddleware';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Falls back to the refresh token (and renews) when the access token lapsed.
    // The session lookup already joins the user row, so no second query.
    const auth = await authenticate(req, res);

    if (!auth) {
      return res.status(200).json({ authenticated: false });
    }

    return res.status(200).json({
      authenticated: true,
      user: { email: auth.email, name: auth.name, role: auth.role, isAdmin: auth.isAdmin },
    });
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(200).json({ authenticated: false });
  }
}
