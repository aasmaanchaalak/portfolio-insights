import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getAllPositioning, setPositioning, setActionIntentBulk, deletePositioning } from '../../lib/queries';
import { DEFAULT_POSITIONING, ALL_ACTIONS, ActionIntent } from '../../types/positioning';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const positioningData = await getAllPositioning();
        res.status(200).json(positioningData);
      } catch (error) {
        console.error('Error reading positioning:', error);
        res.status(500).json({ error: 'Failed to read positioning data' });
      }
    } else if (req.method === 'POST') {
      try {
        const { code, conviction, strategyType, actionIntent, timeHorizon } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        const positioning = {
          conviction: conviction || DEFAULT_POSITIONING.conviction,
          strategyType: strategyType || DEFAULT_POSITIONING.strategyType,
          actionIntent: actionIntent || DEFAULT_POSITIONING.actionIntent,
          timeHorizon: timeHorizon || undefined,
        };

        await setPositioning(code, positioning);
        res.status(200).json({ success: true, message: 'Positioning updated successfully', positioning });
      } catch (error) {
        console.error('Error updating positioning:', error);
        res.status(500).json({ error: 'Failed to update positioning' });
      }
    } else if (req.method === 'PUT') {
      // Bulk: put several stocks in one action bucket (e.g. Add / Exit).
      try {
        const { codes, actionIntent } = req.body;

        if (!Array.isArray(codes) || codes.length === 0 || !codes.every(c => typeof c === 'string' && c)) {
          return res.status(400).json({ error: 'Stock codes are required' });
        }
        if (!ALL_ACTIONS.includes(actionIntent as ActionIntent)) {
          return res.status(400).json({ error: 'Invalid action' });
        }

        await setActionIntentBulk(codes, actionIntent);
        res.status(200).json({ success: true });
      } catch (error) {
        console.error('Error bulk-updating positioning:', error);
        res.status(500).json({ error: 'Failed to update positioning' });
      }
    } else if (req.method === 'DELETE') {
      try {
        const { code } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Stock code is required' });
        }

        await deletePositioning(code);
        res.status(200).json({ success: true, message: 'Positioning deleted successfully' });
      } catch (error) {
        console.error('Error deleting positioning:', error);
        res.status(500).json({ error: 'Failed to delete positioning' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
}

export default withAuth(handler);
