import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getRealizedExits, getUserByEmail } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    // Realized exits expose quantities and prices — hide from analysts.
    const userEmail = (req as any).user?.email;
    const user = userEmail ? await getUserByEmail(userEmail) : null;
    if (user?.role === 'analyst') {
      return res.status(200).json({ exits: [] });
    }

    const exits = await getRealizedExits();
    return res.status(200).json({ exits });
  } catch (error) {
    console.error('Error reading realized exits:', error);
    return res.status(500).json({ error: 'Failed to read realized exits' });
  }
}

export default withAuth(handler);
