import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../../lib/authMiddleware';
import { getSubscribers, sendPush } from '../../../lib/push';

// Sends a test notification to the caller's own devices.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const subs = await getSubscribers(authUser(req).email);
    let sent = 0;
    for (const sub of subs) {
      if (await sendPush(sub, { title: 'Notifications are on', body: 'You\'ll get alerts for DMA breaks and circuits in your holdings.', tag: 'test', url: '/' })) sent++;
    }
    return res.status(200).json({ devices: subs.length, sent });
  } catch (error) {
    console.error('Push test error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
