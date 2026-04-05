import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getAllBuckets, setBucket } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const buckets = await getAllBuckets();
        res.status(200).json(buckets);
      } catch (error) {
        console.error('Error reading buckets:', error);
        res.status(500).json({ error: 'Failed to read buckets' });
      }
    } else if (req.method === 'POST') {
      try {
        const { code, bucket } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        await setBucket(code, bucket === '' ? null : bucket);
        res.status(200).json({ success: true, message: 'Bucket updated successfully' });
      } catch (error) {
        console.error('Error updating bucket:', error);
        res.status(500).json({ error: 'Failed to update bucket' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
}

export default withAuth(handler);
