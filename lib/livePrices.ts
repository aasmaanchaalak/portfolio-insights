// Intraday quotes for portfolio holdings. NSE symbols come from Yahoo's chart
// endpoint ("<SYMBOL>.NS"). Yahoo doesn't take numeric BSE scrip codes, so
// BSE-only holdings (and NSE misses) fall back to the Screener page price.

import { fetchScreenerCompany } from './pipeline/screener';

export interface LiveQuote {
  price: number;
  prevClose: number | null;
  changePct: number | null;
  time: number; // epoch ms of the last trade
}

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
};

async function fetchYahooQuote(symbol: string): Promise<LiveQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
    const res = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;

    const prev = Number(meta?.previousClose ?? meta?.chartPreviousClose);
    const prevClose = Number.isFinite(prev) && prev > 0 ? prev : null;
    return {
      price: Math.round(price * 100) / 100,
      prevClose,
      changePct: prevClose ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : null,
      time: (Number(meta?.regularMarketTime) || Date.now() / 1000) * 1000,
    };
  } catch {
    return null;
  }
}

/** Quote for one holding: Yahoo NSE first, Screener (price only) as fallback. */
export async function fetchHoldingQuote(nseCode: string | null, bseCode: string | null): Promise<LiveQuote | null> {
  if (nseCode) {
    const q = await fetchYahooQuote(`${nseCode.toUpperCase()}.NS`);
    if (q) return q;
  }
  const code = nseCode || bseCode;
  if (!code) return null;
  const scr = await fetchScreenerCompany(code);
  return scr?.price ? { price: scr.price, prevClose: null, changePct: null, time: Date.now() } : null;
}

/** Runs `fn` over `items` with at most `limit` in flight, so Yahoo doesn't throttle us. */
export async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** True during NSE's regular session (Mon–Fri, 09:15–15:30 IST). Holidays aren't modelled. */
export function isIndianMarketOpen(now: Date = new Date()): boolean {
  const ist = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60000);
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}
