import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import {
  getUserByEmail,
  getRealizedExits,
  getAllEntryData,
  getAllRemarks,
  getAllAssignments,
  getAllBuckets,
  getAllPositioning,
  getAllThemes,
  getAllPledges,
  RealizedExit,
  StockPledge,
} from '../../../lib/queries';

// Everything the team recorded for a stock while it was a holding, looked up by
// ticker so it survives the stock moving to the pipeline (e.g. Exited-Watch).
// Per-stock tables are keyed by NSE/BSE code, same as pipeline tickers.
// Realized exits and pledges expose quantities, so analysts don't get them.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const ticker = typeof req.query.ticker === 'string' ? req.query.ticker.trim() : '';
  if (!ticker) {
    return res.status(400).json({ error: 'ticker is required' });
  }

  try {
    const userEmail = (req as any).user?.email;
    const user = userEmail ? await getUserByEmail(userEmail) : null;
    const isAnalyst = user?.role === 'analyst';

    const [exits, entryData, remarks, assignments, buckets, positioning, themes, pledges] = await Promise.all([
      isAnalyst ? Promise.resolve([] as RealizedExit[]) : getRealizedExits(),
      getAllEntryData(),
      getAllRemarks(),
      getAllAssignments(),
      getAllBuckets(),
      getAllPositioning(),
      getAllThemes(),
      isAnalyst ? Promise.resolve({} as Record<string, StockPledge>) : getAllPledges(),
    ]);

    const upper = ticker.toUpperCase();
    // Per-stock maps are keyed by the raw code; match case-insensitively.
    function pick<T>(map: Record<string, T>): T | null {
      if (upper in map) return map[upper];
      const key = Object.keys(map).find(k => k.toUpperCase() === upper);
      return key ? map[key] : null;
    }

    return res.status(200).json({
      realizedExits: exits.filter(e => e.ticker.toUpperCase() === upper),
      entryData: pick(entryData),
      remarks: pick(remarks),
      assignedTo: pick(assignments),
      bucket: pick(buckets),
      positioning: pick(positioning),
      themes: pick(themes) || [],
      pledge: pick(pledges),
    });
  } catch (error) {
    console.error('Error reading portfolio history:', error);
    return res.status(500).json({ error: 'Failed to read portfolio history' });
  }
}

export default withAuth(handler);
