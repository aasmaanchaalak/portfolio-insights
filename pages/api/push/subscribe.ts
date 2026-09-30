import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../../lib/authMiddleware';
import { savePushSubscription, deletePushSubscription } from '../../../lib/push';

// GET: the public key the browser needs to subscribe.
// POST: save this device's subscription. DELETE: remove it.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { email } = authUser(req);
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
    }
    if (req.method === 'POST') {
      const sub = req.body?.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return res.status(400).json({ error: 'subscription with endpoint and keys is required' });
      }
      await savePushSubscription(email, sub, (req.headers['user-agent'] as string) || null);
      return res.status(200).json({ success: true });
    }
    if (req.method === 'DELETE') {
      const endpoint = req.body?.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
      await deletePushSubscription(email, endpoint);
      return res.status(200).json({ success: true });
    }
    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
