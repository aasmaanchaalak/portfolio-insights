import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getFactsheetInputs, upsertFactsheetInputs } from '../../lib/queries';
import type { FactsheetInputs } from '../../types/factsheet';

const MONTH_RE = /^\d{4}-\d{2}$/;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const month = req.query.month;
      if (typeof month !== 'string' || !MONTH_RE.test(month)) {
        return res.status(400).json({ error: 'month query param (YYYY-MM) required' });
      }
      const inputs = await getFactsheetInputs(month);
      return res.status(200).json(
        inputs ?? { month, cashPosition: null, pmNote: null, fnoPositions: [] }
      );
    }

    if (req.method === 'PUT') {
      const body = req.body as FactsheetInputs;
      if (!body?.month || !MONTH_RE.test(body.month)) {
        return res.status(400).json({ error: 'month (YYYY-MM) required in body' });
      }
      await upsertFactsheetInputs({
        month: body.month,
        cashPosition: body.cashPosition ?? null,
        pmNote: body.pmNote ?? null,
        fnoPositions: Array.isArray(body.fnoPositions) ? body.fnoPositions : [],
      });
      const saved = await getFactsheetInputs(body.month);
      return res.status(200).json(saved);
    }

    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('factsheet-inputs API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
