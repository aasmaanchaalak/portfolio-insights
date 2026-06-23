import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getBulkDealPeople, addBulkDealPerson, removeBulkDealPerson } from '../../lib/queries';

// Global (shared) include/exclude people lists for the Bulk/Block deals filter.
//   GET                       -> { include: string[], exclude: string[] }
//   POST { listType, name }   -> add a client name to a list
//   DELETE { listType, name } -> remove a client name from a list
async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const lists = await getBulkDealPeople();
      return res.status(200).json(lists);
    }

    if (req.method === 'POST' || req.method === 'DELETE') {
      const { listType, name } = req.body || {};
      if (listType !== 'include' && listType !== 'exclude') {
        return res.status(400).json({ error: "listType must be 'include' or 'exclude'" });
      }
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed) {
        return res.status(400).json({ error: 'name is required' });
      }
      if (req.method === 'POST') {
        await addBulkDealPerson(listType, trimmed);
      } else {
        await removeBulkDealPerson(listType, trimmed);
      }
      const lists = await getBulkDealPeople();
      return res.status(200).json(lists);
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error('bulk-deal-people error:', error);
    return res.status(500).json({ error: 'Failed to update people lists' });
  }
}

export default withAuth(handler);
