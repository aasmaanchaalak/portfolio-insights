import { NextApiRequest, NextApiResponse } from 'next';
import { connectRedis } from '../../lib/redis';

const ALERTS_KEY = 'dashboard:alerts';
const ALERT_TTL_HOURS = 24;

export interface StoredAlert {
  id: string;
  stockCode: string;
  stockName: string;
  alertType: string;
  message: string;
  currentPrice: number;
  thresholdValue: number;
  changePercent: number;
  triggeredAt: string;
  isRead: boolean;
  createdAt: string; // ISO timestamp for expiration
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const redis = await connectRedis();

    if (req.method === 'GET') {
      try {
        const data = await redis.get(ALERTS_KEY);
        const alerts: StoredAlert[] = data ? JSON.parse(data) : [];

        // Filter out alerts older than 24 hours
        const now = new Date();
        const validAlerts = alerts.filter(alert => {
          const createdAt = new Date(alert.createdAt);
          const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
          return hoursSinceCreation < ALERT_TTL_HOURS;
        });

        // If we filtered some alerts, save the cleaned list
        if (validAlerts.length < alerts.length) {
          await redis.set(ALERTS_KEY, JSON.stringify(validAlerts));
        }

        res.status(200).json(validAlerts);
      } catch (error) {
        console.error('Error reading alerts from Redis:', error);
        res.status(500).json({ error: 'Failed to read alerts' });
      }
    } else if (req.method === 'POST') {
      try {
        const { alerts: newAlerts } = req.body;

        if (!Array.isArray(newAlerts)) {
          return res.status(400).json({ error: 'Alerts must be an array' });
        }

        // Get existing alerts
        const data = await redis.get(ALERTS_KEY);
        const existingAlerts: StoredAlert[] = data ? JSON.parse(data) : [];

        // Filter out expired alerts
        const now = new Date();
        const validExistingAlerts = existingAlerts.filter(alert => {
          const createdAt = new Date(alert.createdAt);
          const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
          return hoursSinceCreation < ALERT_TTL_HOURS;
        });

        // Add createdAt to new alerts and merge (avoiding duplicates by id)
        const existingIds = new Set(validExistingAlerts.map(a => a.id));
        const alertsToAdd = newAlerts
          .filter((alert: StoredAlert) => !existingIds.has(alert.id))
          .map((alert: StoredAlert) => ({
            ...alert,
            createdAt: alert.createdAt || new Date().toISOString(),
          }));

        const mergedAlerts = [...validExistingAlerts, ...alertsToAdd];

        await redis.set(ALERTS_KEY, JSON.stringify(mergedAlerts));
        res.status(200).json({ success: true, message: 'Alerts saved successfully', count: mergedAlerts.length });
      } catch (error) {
        console.error('Error saving alerts to Redis:', error);
        res.status(500).json({ error: 'Failed to save alerts' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Redis connection error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
}
