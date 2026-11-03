import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../lib/authMiddleware';
import { getAccountHoldings, getAccountsMeta, setAccountMeta } from '../../lib/accounts';

// GET → { accounts: AccountMeta[] (only those in the latest upload), holdings, updatedAt }
// PUT → { portfolio, label?, familyOffice? }  (admin only)
// Per-account quantities, so hidden from analysts.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = authUser(req);
  if (user.role === 'analyst') {
    return res.status(403).json({ error: 'Not available for analysts' });
  }
  try {
    if (req.method === 'GET') {
      const [snap, meta] = await Promise.all([getAccountHoldings(), getAccountsMeta()]);
      const inUpload = new Set((snap?.holdings || []).map(h => h.portfolio));
      res.status(200).json({
        accounts: meta.filter(m => inUpload.has(m.portfolio)),
        holdings: snap?.holdings || [],
        updatedAt: snap?.updatedAt || null,
      });
    } else if (req.method === 'PUT') {
      if (!user.isAdmin) return res.status(403).json({ error: 'Admin only' });
      const { portfolio, label, familyOffice } = req.body || {};
      if (!portfolio || typeof portfolio !== 'string') {
        return res.status(400).json({ error: 'Account (portfolio) is required' });
      }
      const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 255) : null);
      await setAccountMeta(portfolio, clean(label), clean(familyOffice));
      res.status(200).json({ success: true });
    } else {
      res.setHeader('Allow', ['GET', 'PUT']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Error handling accounts:', error);
    res.status(500).json({ error: 'Failed to handle accounts' });
  }
}

export default withAuth(handler);
