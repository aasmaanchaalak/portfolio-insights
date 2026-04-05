import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';
import { getAlerts, saveAlerts } from '../../lib/queries';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      try {
        const alerts = await getAlerts();
        res.status(200).json(alerts);
      } catch (error) {
        console.error('Error reading alerts:', error);
        res.status(500).json({ error: 'Failed to read alerts' });
      }
    } else if (req.method === 'POST') {
      try {
        const { alerts: newAlerts } = req.body;

        if (!Array.isArray(newAlerts)) {
          return res.status(400).json({ error: 'Alerts must be an array' });
        }

        const alertsToSave = newAlerts.map((alert: any) => ({
          stockCode: alert.stockCode,
          stockName: alert.stockName,
          alertType: alert.alertType,
          message: alert.message,
          currentPrice: alert.currentPrice,
          thresholdValue: alert.thresholdValue,
          changePercent: alert.changePercent,
          triggeredAt: alert.triggeredAt,
          isRead: alert.isRead || false,
        }));

        await saveAlerts(alertsToSave);
        res.status(200).json({ success: true, message: 'Alerts saved successfully' });
      } catch (error) {
        console.error('Error saving alerts:', error);
        res.status(500).json({ error: 'Failed to save alerts' });
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
