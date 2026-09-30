// Intraday quotes for portfolio holdings.
// - NSE (mainboard and SME): Yahoo's chart endpoint, "<SYMBOL>.NS", or
//   "<SYMBOL>-SM.NS" for NSE Emerge listings.
// - BSE-only scrips: BSE's own quote API (Yahoo doesn't take numeric codes).
// - Anything still missing: the Screener page price (no day change).

import https from 'https';
import zlib from 'zlib';
import { fetchScreenerCompany } from './pipeline/screener';
import { LiveQuote } from './marketHours';

export type { LiveQuote };
export { isIndianMarketOpen } from './marketHours';

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
};

// Yahoo keeps serving a dead listing (e.g. an SME stock's pre-migration
// symbol) with years-old prices, so treat anything this old as a miss.
const MAX_QUOTE_AGE_MS = 10 * 24 * 60 * 60 * 1000;

async function fetchYahooQuote(symbol: string): Promise<LiveQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
    const res = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;

    const time = Number(meta?.regularMarketTime) * 1000;
    if (!Number.isFinite(time) || Date.now() - time > MAX_QUOTE_AGE_MS) return null;

    const prev = Number(meta?.previousClose ?? meta?.chartPreviousClose);
    const prevClose = Number.isFinite(prev) && prev > 0 ? prev : null;
    return {
      price: Math.round(price * 100) / 100,
      prevClose,
      changePct: prevClose ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : null,
      time,
    };
  } catch {
    return null;
  }
}

const BSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  // BSE's CDN rejects requests that don't look like a browser's.
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
  'Origin': 'https://www.bseindia.com',
  'Referer': 'https://www.bseindia.com/',
};

// BSE's CDN sometimes sends headers with stray leading whitespace, which
// fetch()'s strict parser rejects outright — so use https with the lenient parser.
function getJsonLenient(url: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, insecureHTTPParser: true, timeout: 8000 }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const enc = res.headers['content-encoding'];
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip())
        : enc === 'deflate' ? res.pipe(zlib.createInflate())
        : res;
      let body = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => { body += chunk; });
      stream.on('end', () => {
        try { resolve(JSON.parse(body)); } catch {
          reject(new Error(`bad JSON (${res.headers['content-type'] || 'no type'}): ${body.slice(0, 120).replace(/\s+/g, ' ')}`));
        }
      });
      stream.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function fetchBseQuote(scripCode: string): Promise<LiveQuote | null> {
  if (!/^\d{6}$/.test(scripCode)) return null;
  const url = `https://api.bseindia.com/BseIndiaAPI/api/getScripHeaderData/w?Debtflag=&scripcode=${scripCode}&seriesid=`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rate = (await getJsonLenient(url, BSE_HEADERS))?.CurrRate;
      const price = parseFloat(rate?.LTP);
      if (!Number.isFinite(price) || price <= 0) {
        console.warn(`[live-prices] BSE ${scripCode}: no LTP in response`, JSON.stringify(rate ?? null).slice(0, 200));
        return null;
      }
      const chg = parseFloat(rate?.Chg);
      const pct = parseFloat(rate?.PcChg);
      return {
        price,
        prevClose: Number.isFinite(chg) ? Math.round((price - chg) * 100) / 100 : null,
        changePct: Number.isFinite(pct) ? pct : null,
        time: Date.now(),
      };
    } catch (e: any) {
      // Logged to diagnose BSE failures seen only on Vercel.
      console.warn(`[live-prices] BSE ${scripCode} attempt ${attempt + 1} failed: ${e?.code || ''} ${e?.message || e}`);
    }
  }
  return null;
}

// Which Yahoo suffix worked for each NSE symbol, so SME stocks skip the
// failed ".NS" lookup on later refreshes (lives as long as the server instance).
const nseSuffixMemo = new Map<string, string>();

/** Quote for one holding: NSE via Yahoo, BSE via BSE's API, Screener as last resort. */
export async function fetchHoldingQuote(nseCode: string | null, bseCode: string | null): Promise<LiveQuote | null> {
  if (nseCode) {
    const sym = nseCode.toUpperCase();
    const known = nseSuffixMemo.get(sym);
    for (const suffix of known ? [known] : ['.NS', '-SM.NS']) {
      const q = await fetchYahooQuote(sym + suffix);
      if (q) {
        nseSuffixMemo.set(sym, suffix);
        return q;
      }
    }
    nseSuffixMemo.delete(sym);
  }
  if (bseCode) {
    const q = await fetchBseQuote(String(bseCode));
    if (q) return q;
  }
  const code = nseCode || bseCode;
  if (!code) return null;
  const scr = await fetchScreenerCompany(code);
  if (!scr?.price) console.warn(`[live-prices] no quote for ${code}: Screener fallback also failed`);
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
