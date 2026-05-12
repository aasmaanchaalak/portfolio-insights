import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getAllThemes, setThemes, getAllThemeNames } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const [themes, allNames] = await Promise.all([getAllThemes(), getAllThemeNames()]);
      return res.status(200).json({ themes, allNames });
    } else if (req.method === 'POST') {
      const { code, themes } = req.body;
      if (!code || !Array.isArray(themes)) {
        return res.status(400).json({ error: 'code and themes array required' });
      }
      await setThemes(code, themes);
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in themes API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
