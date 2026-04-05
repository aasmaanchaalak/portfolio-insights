import { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { verifyToken, COOKIE_OPTIONS } from '../../../lib/auth';
import { deleteSession } from '../../../lib/queries';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const token = req.cookies.accessToken;

    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        await deleteSession(payload.sessionId);
      }
    }

    res.setHeader('Set-Cookie', [
      serialize('accessToken', '', { ...COOKIE_OPTIONS, maxAge: 0 }),
      serialize('refreshToken', '', { ...COOKIE_OPTIONS, maxAge: 0 }),
    ]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Logout failed' });
  }
}
