import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'portfolio.json');

// Ensure data directory exists
const ensureDataDir = () => {
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// Initialize with empty data if file doesn't exist
const initializeDataFile = () => {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  initializeDataFile();

  if (req.method === 'GET') {
    try {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const portfolioData = JSON.parse(data);
      res.status(200).json(portfolioData);
    } catch (error) {
      console.error('Error reading portfolio data:', error);
      res.status(500).json({ error: 'Failed to read portfolio data' });
    }
  } else if (req.method === 'POST') {
    try {
      const { data: portfolioData } = req.body;
      
      if (!Array.isArray(portfolioData)) {
        return res.status(400).json({ error: 'Data must be an array' });
      }

      fs.writeFileSync(DATA_FILE, JSON.stringify(portfolioData, null, 2));
      res.status(200).json({ success: true, message: 'Portfolio data updated successfully' });
    } catch (error) {
      console.error('Error updating portfolio data:', error);
      res.status(500).json({ error: 'Failed to update portfolio data' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}