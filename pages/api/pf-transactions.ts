import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../lib/authMiddleware';
import { previewTransactions, applyTransactions, TxnInput } from '../../lib/pfTransactions';

// POST { action: 'preview' | 'apply', transactions: TxnInput[], mappings?: { [asset]: code } }
// Applies buys/sells to the last holdings snapshot (see lib/pfTransactions.ts).
// Managers and admins only, like the other PF Data uploads.

function clean(raw: any): TxnInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v: any) => (v == null || v === '' ? null : Number(v));
  const date = String(raw.date || '');
  const asset = String(raw.asset || '').trim();
  const quantity = num(raw.quantity);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !asset || quantity == null || !isFinite(quantity)) return null;
  return {
    portfolio: String(raw.portfolio || '').trim().slice(0, 255),
    date,
    type: String(raw.type || '').trim().slice(0, 40),
    asset: asset.slice(0, 255),
    quantity: Math.abs(quantity),
    price: num(raw.price) ?? 0,
    brokerage: num(raw.brokerage) ?? 0,
    amount: num(raw.amount),
    balQty: num(raw.balQty),
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const user = authUser(req);
  if (!(user.role === 'manager' || user.isAdmin)) return res.status(403).json({ error: 'Forbidden' });

  const { action, transactions, mappings } = req.body || {};
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: 'No transactions' });
  }
  if (transactions.length > 20000) return res.status(400).json({ error: 'Too many rows in one upload' });
  const txns = transactions.map(clean);
  const bad = txns.findIndex(t => !t);
  if (bad >= 0) return res.status(400).json({ error: `Row ${bad + 1} is missing a date, asset or quantity` });
  const map: Record<string, string> = mappings && typeof mappings === 'object' ? mappings : {};

  try {
    if (action === 'apply') {
      const result = await applyTransactions(txns as TxnInput[], map, user.name || user.email);
      return res.status(200).json({ success: true, ...result });
    }
    return res.status(200).json(await previewTransactions(txns as TxnInput[], map));
  } catch (e: any) {
    console.error('PF transactions error:', e);
    return res.status(e?.message?.startsWith('Map these assets') ? 400 : 500).json({ error: e?.message || 'Failed to process transactions' });
  }
}

export default withAuth(handler);

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };
