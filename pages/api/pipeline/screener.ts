import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { fetchScreenerCompany, screenerCodeFromUrl } from '../../../lib/pipeline/screener';

// GET ?url=<screener.in company link> → { company: { code, companyName, nseSymbol, bseCode, price } }
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  const code = screenerCodeFromUrl(url);
  if (!code) return res.status(400).json({ error: 'Not a Screener company link' });

  const company = await fetchScreenerCompany(code);
  if (!company) return res.status(404).json({ error: 'Couldn’t read that Screener page' });
  return res.status(200).json({ company });
}

export default withAuth(handler);
