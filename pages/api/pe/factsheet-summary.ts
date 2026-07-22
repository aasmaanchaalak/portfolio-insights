import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { listCompaniesFull } from '../../../lib/pe/queries';
import { computePEFactsheetSummary } from '../../../lib/pe/calculations';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const companies = await listCompaniesFull();
    const summary = computePEFactsheetSummary(companies);
    return res.status(200).json(summary);
  } catch (error) {
    console.error('PE factsheet-summary API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
