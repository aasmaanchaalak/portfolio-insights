// SPAN rates for futures, from NSE Clearing's daily SPAN risk file.
//
// For a future, SPAN margin = |qty| × price scan range, and NSE sets the scan
// range per underlying from its volatility (e.g. 18.5% of price for Ashok
// Leyland, 29.6% for Kaynes). The percentage drifts slowly, so it's read
// once a day and applied to live prices all day:
//   margin = |qty| × price × (SPAN % + exposure %)
// If NSE's file can't be fetched, the last good rates keep being used.

import { unzipSync, strFromU8 } from 'fflate';
import { getCache, setCache } from '../queries';

export interface SpanRates {
  fileDate: string;               // YYYY-MM-DD of the SPAN file used
  rank: string;                   // fileDate + ".2" (end of day) or ".1" (start of day)
  rates: Record<string, number>;  // underlying → price scan as a fraction of price
}

const KEY = 'fo:span-rates';
const CHECKED_KEY = 'fo:span-checked';
const RECHECK_SECONDS = 3 * 60 * 60;   // look for a newer file at most every 3 hours
const KEEP_SECONDS = 30 * 24 * 60 * 60;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };

const istYmd = (ms: number) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);

/** Price scan % per underlying from one SPAN file's XML. */
export function parseSpanFile(xml: string): Record<string, number> {
  const rates: Record<string, number> = {};
  let at = 0;
  for (;;) {
    const start = xml.indexOf('<futPf>', at);
    if (start < 0) break;
    const end = xml.indexOf('</futPf>', start);
    if (end < 0) break;
    const block = xml.slice(start, end);
    at = end;
    const code = block.match(/<pfCode>([^<]+)<\/pfCode>/)?.[1]?.trim().toUpperCase();
    // First contract of the portfolio: its price and scan range (the scan is the same ₹ for every expiry).
    const price = parseFloat(block.match(/<fut>[\s\S]*?<p>([\d.]+)<\/p>/)?.[1] ?? '');
    const scan = parseFloat(block.match(/<priceScan>([\d.]+)<\/priceScan>/)?.[1] ?? '');
    if (code && price > 0 && scan > 0) rates[code] = scan / price;
  }
  return rates;
}

async function download(ymd: string, kind: 's' | 'i1'): Promise<Record<string, number> | null> {
  const url = `https://nsearchives.nseindia.com/archives/nsccl/span/nsccl.${ymd.replace(/-/g, '')}.${kind}.zip`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()), { filter: f => f.name.endsWith('.spn') });
  const spn = Object.values(files)[0];
  if (!spn) return null;
  const rates = parseSpanFile(strFromU8(spn));
  // A file with hardly any futures is broken, not a market with no futures.
  return Object.keys(rates).length > 50 ? rates : null;
}

/** Newer files than `have` (rank "YYYY-MM-DD.2" = end of day, ".1" = start of day), newest first. */
async function fetchLatest(have: string | null): Promise<SpanRates | null> {
  for (let back = 0; back < 7; back++) {
    const ymd = istYmd(Date.now() - back * 86400e3);
    for (const kind of ['s', 'i1'] as const) {
      const rank = `${ymd}.${kind === 's' ? 2 : 1}`;
      if (have && rank <= have) return null;
      try {
        const rates = await download(ymd, kind);
        if (rates) return { fileDate: ymd, rank, rates };
      } catch (e: any) {
        console.warn(`[fo] SPAN file ${ymd}.${kind} unavailable: ${e?.message}`);
      }
    }
  }
  return null;
}

let inflight: Promise<SpanRates | null> | null = null;

/** Latest SPAN rates; refreshes from NSE at most every few hours, else serves the last good set. */
export function getSpanRates(): Promise<SpanRates | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    const cached = await getCache<SpanRates>(KEY);
    if (cached && await getCache(CHECKED_KEY)) return cached;
    await setCache(CHECKED_KEY, true, RECHECK_SECONDS);
    const fresh = await fetchLatest(cached?.rank ?? null);
    if (fresh) {
      await setCache(KEY, fresh, KEEP_SECONDS);
      return fresh;
    }
    return cached;
  })().finally(() => { inflight = null; });
  return inflight;
}
