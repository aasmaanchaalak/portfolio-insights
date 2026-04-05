import { NextApiRequest, NextApiResponse } from 'next';
import { NseIndia } from 'stock-nse-india';
import { withAuth } from '../../lib/authMiddleware';
import { getCache, setCache } from '../../lib/queries';

const CACHE_KEY = 'nifty-smallcap:data';
const CACHE_DURATION_SECONDS = 300; // 5 minutes cache

interface NiftySmallcapData {
  lastPrice: number;
  dailyChange: number;
  weeklyChange: number;
  monthlyChange: number;
  yearlyChange: number;
  pe: number | null;
  lastUpdated: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Check cache first
    const cachedData = await getCache<NiftySmallcapData>(CACHE_KEY);
    if (cachedData) {
      // Check if cache is still valid (within 5 minutes)
      const cacheTime = new Date(cachedData.lastUpdated).getTime();
      const now = Date.now();
      if (now - cacheTime < CACHE_DURATION_SECONDS * 1000) {
        return res.status(200).json(cachedData);
      }
    }

    // Fetch fresh data from NSE
    const nse = new NseIndia();
    const allIndices = await nse.getAllIndices();

    // Find Nifty Smallcap 100
    const smallcap = allIndices.data?.find(
      (d: any) => d.indexSymbol === 'NIFTY SMLCAP 100'
    ) as any;

    if (!smallcap) {
      return res.status(404).json({ error: 'Nifty Smallcap 100 index not found' });
    }

    // Calculate weekly change from oneWeekAgoVal
    const oneWeekAgoVal = smallcap.oneWeekAgoVal;
    const lastPrice = smallcap.last;
    const weeklyChange = oneWeekAgoVal && lastPrice
      ? ((lastPrice - oneWeekAgoVal) / oneWeekAgoVal) * 100
      : null;

    const data: NiftySmallcapData = {
      lastPrice: lastPrice,
      dailyChange: smallcap.percentChange,
      weeklyChange: weeklyChange !== null ? parseFloat(weeklyChange.toFixed(2)) : 0,
      monthlyChange: smallcap.perChange30d || 0,
      yearlyChange: smallcap.perChange365d || 0,
      pe: smallcap.pe || smallcap.PE || null,
      lastUpdated: new Date().toISOString(),
    };

    // Cache the data
    await setCache(CACHE_KEY, data, CACHE_DURATION_SECONDS);

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching Nifty Smallcap data:', error);
    return res.status(500).json({ error: 'Failed to fetch Nifty Smallcap data' });
  }
}

export default withAuth(handler);
