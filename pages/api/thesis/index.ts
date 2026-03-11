import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../../lib/authMiddleware';
import { createThesis } from '../../../lib/thesis/queries';
import { CreateThesisRequest } from '../../../types/thesis';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const data: CreateThesisRequest = req.body;

    if (!data.stockCode || !data.stockName) {
      return res.status(400).json({ error: 'stockCode and stockName are required' });
    }

    const thesis = await createThesis(data);
    res.status(201).json({ success: true, thesis });
  } catch (error: any) {
    console.error('Error creating thesis:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Thesis already exists for this stock' });
    }

    res.status(500).json({ error: 'Failed to create thesis' });
  }
}

export default withAuth(handler);
