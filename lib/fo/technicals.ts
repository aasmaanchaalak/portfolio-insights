// Technical levels for F&O underlyings that aren't portfolio holdings (so
// have no Screener data): 50/200 DMA, 52-week range and RSI(14) from a year
// of daily closes, cached for the day. The Overview's Technical Alerts use
// them like a holding's.

import { getCache, setCache } from '../queries';
import { fetchYahooDaily, mapWithLimit, LiveQuote } from '../livePrices';
import { FoTechnical } from './types';

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Wilder's RSI over the last `n` changes. */
function rsi(closes: number[], n = 14): number | null {
  if (closes.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

type Levels = Omit<FoTechnical, 'symbol' | 'price' | 'return1D' | 'downFrom52WeekHigh' | 'upFrom52WeekLow'>;

/** `tickers` maps underlying → Yahoo symbol; `quotes` supplies live prices. */
export async function getUnderlyingTechnicals(
  tickers: Record<string, string>,
  quotes: Record<string, LiveQuote>,
  today: string,
): Promise<FoTechnical[]> {
  const key = `fo:technicals:${today}`;
  const cached = (await getCache<Record<string, Levels | null>>(key)) || {};
  const missing = Object.keys(tickers).filter(s => !(s in cached));
  if (missing.length) {
    const fetched = await mapWithLimit(missing, 6, async sym => {
      const bars = await fetchYahooDaily(tickers[sym]);
      if (!bars || bars.length < 50) return null;
      const closes = bars.map(b => b.close);
      return {
        dma50: avg(closes.slice(-50)),
        dma200: closes.length >= 200 ? avg(closes.slice(-200)) : null,
        high52: Math.max(...bars.map(b => b.high)),
        low52: Math.min(...bars.map(b => b.low)),
        rsi: rsi(closes),
      } as Levels;
    });
    missing.forEach((s, i) => { cached[s] = fetched[i]; });
    await setCache(key, cached, 24 * 60 * 60);
  }
  return Object.keys(tickers).flatMap(sym => {
    const lv = cached[sym], q = quotes[sym];
    if (!lv || !q) return [];
    return [{
      symbol: sym, ...lv,
      price: q.price,
      return1D: q.changePct,
      downFrom52WeekHigh: lv.high52 > 0 ? Math.max(0, (lv.high52 - q.price) / lv.high52 * 100) : null,
      upFrom52WeekLow: lv.low52 > 0 ? Math.max(0, (q.price - lv.low52) / lv.low52 * 100) : null,
    }];
  });
}
