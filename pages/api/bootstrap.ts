import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../lib/authMiddleware';
import { getGridKeyData, getAnalystOverrides, getPortfolioHistory, getTeamMembers } from '../../lib/queries';
import { getPortfolioResponse, getGridKeyResponse } from '../../lib/portfolioResponse';

// Everything the app shell loads on start, in one request: one auth check and
// one parallel batch of queries instead of four separate API calls.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { role } = authUser(req);
    const shared = {
      gridKey: getGridKeyData(),
      overrides: role === 'analyst' ? getAnalystOverrides() : undefined,
    };
    const [stocks, gridKey, portfolioHistory, teamMembers] = await Promise.all([
      getPortfolioResponse(role, shared),
      getGridKeyResponse(role, shared),
      getPortfolioHistory(),
      getTeamMembers(),
    ]);

    return res.status(200).json({
      stocks,
      gridKeyData: gridKey.gridKeyData,
      privateInvestments: gridKey.privateInvestments,
      portfolioHistory,
      teamMembers,
    });
  } catch (error) {
    console.error('Bootstrap error:', error);
    return res.status(500).json({ error: 'Failed to load app data' });
  }
}

export default withAuth(handler);
