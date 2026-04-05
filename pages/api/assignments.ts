import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getAllAssignments, setAssignment } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const assignments = await getAllAssignments();
        res.status(200).json(assignments);
      } catch (error) {
        console.error('Error reading assignments:', error);
        res.status(500).json({ error: 'Failed to read assignments' });
      }
    } else if (req.method === 'POST') {
      try {
        const { code, assignedTo } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        await setAssignment(code, assignedTo === '' ? null : assignedTo);
        res.status(200).json({ success: true, message: 'Assignment updated successfully' });
      } catch (error) {
        console.error('Error updating assignment:', error);
        res.status(500).json({ error: 'Failed to update assignment' });
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
