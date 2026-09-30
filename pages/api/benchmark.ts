import { NextApiRequest, NextApiResponse } from 'next';
import { NseIndia } from 'stock-nse-india';
import { withAuth } from '../../lib/authMiddleware';
import { getCache, setCache } from '../../lib/queries';
import { getFirmSettings } from '../../lib/firmSettings';

const CACHE_DURATION_SECONDS = 300; // 5 minutes cache

// The firm's benchmark index (Admin → Firm settings), e.g. Nifty Smallcap 100.
interface BenchmarkData {
  symbol: string;
  label: string;
  short: string;
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
    const { benchmark } = await getFirmSettings();
    const cacheKey = `benchmark:${benchmark.symbol}`;

    // Check cache first
    const cachedData = await getCache<BenchmarkData>(cacheKey);
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

    const index = allIndices.data?.find(
      (d: any) => d.indexSymbol === benchmark.symbol
    ) as any;

    if (!index) {
      return res.status(404).json({ error: `${benchmark.label} index not found` });
    }

    // Calculate weekly change from oneWeekAgoVal
    const oneWeekAgoVal = index.oneWeekAgoVal;
    const lastPrice = index.last;
    const weeklyChange = oneWeekAgoVal && lastPrice
      ? ((lastPrice - oneWeekAgoVal) / oneWeekAgoVal) * 100
      : null;

    const data: BenchmarkData = {
      symbol: benchmark.symbol,
      label: benchmark.label,
      short: benchmark.short,
      lastPrice: lastPrice,
      dailyChange: index.percentChange,
      weeklyChange: weeklyChange !== null ? parseFloat(weeklyChange.toFixed(2)) : 0,
      monthlyChange: index.perChange30d || 0,
      yearlyChange: index.perChange365d || 0,
      pe: index.pe || index.PE || null,
      lastUpdated: new Date().toISOString(),
    };

    // Cache the data
    await setCache(cacheKey, data, CACHE_DURATION_SECONDS);

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching benchmark data:', error);
    return res.status(500).json({ error: 'Failed to fetch benchmark data' });
  }
}

export default withAuth(handler);
