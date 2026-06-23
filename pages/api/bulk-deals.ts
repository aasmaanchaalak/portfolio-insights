import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '../../lib/authMiddleware';

// ---------------------------------------------------------------------------
// Bulk / Block deals API
//
// Tries the authoritative NSE official endpoints first (bulk + block), which
// require a cookie handshake. On Vercel (datacenter IP) NSE frequently blocks
// the call, so we fall back to Chittorgarh for BULK deals (no handshake, not
// geo-fenced). The response always reports WHICH source actually answered and
// an `attempts` log so the page can surface it.
// ---------------------------------------------------------------------------

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const NSE_REPORT_PAGE =
  'https://www.nseindia.com/report-detail/display-bulk-and-block-deals';

export interface Deal {
  date: string;        // raw date string as returned by the source
  symbol: string;
  securityCode?: string; // BSE numeric scrip code (for matching against portfolio bseCode)
  scripName: string;
  clientName: string;
  buySell: string;     // BUY / SELL (BSE abbreviates as B / S)
  quantity: number;
  price: number;       // traded / weighted avg traded price
  dealType: 'bulk' | 'block';
  exchange: 'NSE' | 'BSE';
  source: 'nse' | 'chittorgarh';
}

// One exchange's deals plus where they came from
export interface ExchangeDeals {
  exchange: 'NSE' | 'BSE';
  source: 'nse' | 'chittorgarh' | 'none';
  sourceLabel: string;
  date: string | null;
  bulk: Deal[];
  block: Deal[];
}

interface Attempt {
  source: string;
  ok: boolean;
  detail: string;
}

// --- date helpers ----------------------------------------------------------

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Indian financial year string e.g. "2026-27" (Apr–Mar) for a given calendar year/month
function financialYear(d: Date): string {
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan
  const startYear = month >= 3 ? year : year - 1; // FY starts in April (month index 3)
  const endYY = (startYear + 1) % 100;
  return `${startYear}-${pad(endYY)}`;
}

// Best-effort parse of the many date formats these sources use into a timestamp
function parseDealDate(raw: string): number {
  if (!raw) return NaN;
  const s = raw.trim();
  // DD-Mon-YYYY (e.g. 23-Jun-2026)
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  let m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})$/);
  if (m) {
    const mon = months[m[2].toLowerCase()];
    if (mon !== undefined) return new Date(Number(m[3]), mon, Number(m[1])).getTime();
  }
  // DD-MM-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const t = Date.parse(s);
  return isNaN(t) ? NaN : t;
}

// Keep only deals from the single most-recent day present in the set
function filterLatestDay(deals: Deal[]): { deals: Deal[]; date: string | null } {
  if (deals.length === 0) return { deals: [], date: null };
  let maxTs = -Infinity;
  let maxRaw: string | null = null;
  for (const d of deals) {
    const ts = parseDealDate(d.date);
    if (!isNaN(ts) && ts > maxTs) {
      maxTs = ts;
      maxRaw = d.date;
    }
  }
  if (maxRaw === null) return { deals, date: null };
  const latest = deals.filter(d => parseDealDate(d.date) === maxTs);
  return { deals: latest, date: maxRaw };
}

// Collapse bulk + block to the single most-recent day across BOTH lists, so the
// view shows one consistent trading day (today, or the latest prior day — e.g.
// yesterday / Friday — when today has no published deals).
function latestDayBoth(bulk: Deal[], block: Deal[]): { bulk: Deal[]; block: Deal[]; date: string | null } {
  let maxTs = -Infinity;
  let maxRaw: string | null = null;
  for (const d of [...bulk, ...block]) {
    const ts = parseDealDate(d.date);
    if (!isNaN(ts) && ts > maxTs) { maxTs = ts; maxRaw = d.date; }
  }
  if (maxRaw === null) return { bulk, block, date: null };
  return {
    bulk: bulk.filter(d => parseDealDate(d.date) === maxTs),
    block: block.filter(d => parseDealDate(d.date) === maxTs),
    date: maxRaw,
  };
}

// --- NSE official (with cookie handshake) ----------------------------------

function collectCookies(res: Response, jar: Map<string, string>) {
  // undici (Node fetch) exposes getSetCookie(); fall back to a single header
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  const setCookies: string[] = anyHeaders.getSetCookie
    ? anyHeaders.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

// Chrome-like header set — NSE's Akamai layer scores requests on these
const SEC_HEADERS = {
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Accept-Encoding': 'gzip, deflate, br',
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Hit the home + report pages to seed/refresh the Akamai cookie set.
async function warmCookies(jar: Map<string, string>): Promise<void> {
  const pageHeaders = {
    'User-Agent': BROWSER_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Upgrade-Insecure-Requests': '1',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    ...SEC_HEADERS,
  };

  // Step 1: home page seeds the initial cookies
  const home = await fetch('https://www.nseindia.com', { headers: pageHeaders });
  collectCookies(home, jar);

  // Step 2: report page (with cookies) — this is when Akamai usually issues the
  // ak_bmsc / bm_sv cookies the API actually checks for.
  const report = await fetch(NSE_REPORT_PAGE, {
    headers: { ...pageHeaders, 'sec-fetch-site': 'same-origin', Referer: 'https://www.nseindia.com/', Cookie: cookieHeader(jar) },
  });
  collectCookies(report, jar);
}

// NSE large-deals snapshot — returns the latest trading day's bulk + block (+
// short) deals in a single call. We use this instead of /api/historical/*,
// which is gated behind Akamai's _abck bot-validation (always 503 server-side).
// It also matches our use case exactly: we want the latest day, not a range.
const NSE_LARGEDEAL_PAGE = 'https://www.nseindia.com/market-data/large-deals';

function mapSnapshotRow(row: any, kind: 'bulk' | 'block'): Deal {
  return {
    date: String(row.date ?? ''),
    symbol: String(row.symbol ?? ''),
    scripName: String(row.name ?? ''),
    clientName: String(row.clientName ?? ''),
    buySell: String(row.buySell ?? ''),
    quantity: Number(String(row.qty ?? '0').replace(/,/g, '')) || 0,
    price: Number(String(row.watp ?? '0').replace(/,/g, '')) || 0,
    dealType: kind,
    exchange: 'NSE' as const,
    source: 'nse' as const,
  };
}

async function fetchNse(): Promise<{ bulk: Deal[]; block: Deal[]; asOn: string | null }> {
  const jar = new Map<string, string>();
  await warmCookies(jar);

  const apiHeaders = () => ({
    'User-Agent': BROWSER_UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: NSE_LARGEDEAL_PAGE,
    'X-Requested-With': 'XMLHttpRequest',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    ...SEC_HEADERS,
    Cookie: cookieHeader(jar),
  });

  const url = 'https://www.nseindia.com/api/snapshot-capital-market-largedeal';
  // Retry on the Akamai-block statuses, re-warming cookies between tries.
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: apiHeaders() });
    if (r.ok) {
      const json: any = await r.json();
      const bulkRows: any[] = Array.isArray(json?.BULK_DEALS_DATA) ? json.BULK_DEALS_DATA : [];
      const blockRows: any[] = Array.isArray(json?.BLOCK_DEALS_DATA) ? json.BLOCK_DEALS_DATA : [];
      return {
        bulk: bulkRows.map(row => mapSnapshotRow(row, 'bulk')),
        block: blockRows.map(row => mapSnapshotRow(row, 'block')),
        asOn: json?.as_on_date ? String(json.as_on_date) : null,
      };
    }
    lastStatus = r.status;
    if (r.status === 401 || r.status === 403 || r.status === 503) {
      await delay(600);
      await warmCookies(jar); // refresh cookies before retrying
      continue;
    }
    break; // other statuses are unlikely to recover via retry
  }
  throw new Error(`NSE large-deals snapshot returned HTTP ${lastStatus}`);
}

// --- Chittorgarh (bulk only — used for BSE, and as the NSE fallback) --------

// Chittorgarh report ids: 119 = NSE bulk, 139 = BSE bulk
const CHITTORGARH_REPORT = { NSE: 119, BSE: 139 } as const;

// pick the first value among a list of candidate keys (case-insensitive)
function pick(row: Record<string, any>, candidates: string[]): string {
  const lowerMap: Record<string, any> = {};
  for (const k of Object.keys(row)) lowerMap[k.toLowerCase().trim()] = row[k];
  for (const c of candidates) {
    const v = lowerMap[c.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return '';
}

async function fetchChittorgarhBulk(d: Date, exchange: 'NSE' | 'BSE'): Promise<Deal[]> {
  const report = CHITTORGARH_REPORT[exchange];
  const year = d.getFullYear();

  const callOnce = async (fy: string): Promise<any[]> => {
    const url = `https://webnodejs.chittorgarh.com/cloud/report/data-read/${report}/1/1/${year}/${fy}/0/all`;
    const r = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Chittorgarh ${exchange} returned HTTP ${r.status}`);
    const json: any = await r.json();
    // rows live under reportTableData; fall back to the first array we find
    if (Array.isArray(json?.reportTableData)) return json.reportTableData;
    if (Array.isArray(json?.data)) return json.data;
    for (const v of Object.values(json ?? {})) if (Array.isArray(v)) return v as any[];
    return [];
  };

  let rows = await callOnce(financialYear(d));
  if (rows.length === 0) {
    // retry with previous FY string per the spec
    const prev = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
    rows = await callOnce(financialYear(prev));
  }

  return rows.map(row => {
    // prefer the clean machine fields (~Quantity_Traded, ~input_date) when present
    const cleanQty = row['~Quantity_Traded'];
    const securityCode = pick(row, ['Security Code']);
    return {
      date: pick(row, ['Date', 'BD_DT_DATE', 'Deal Date']),
      symbol: pick(row, ['Symbol', 'Security Code', 'BD_SYMBOL']),
      ...(securityCode ? { securityCode } : {}),
      scripName: pick(row, ['Security Name', 'Company Name', 'BD_SCRIP_NAME']),
      clientName: pick(row, ['Client Name', 'BD_CLIENT_NAME', 'Client']),
      buySell: pick(row, ['Buy/Sell', 'BD_BUY_SELL', 'Deal Type', 'Type']),
      quantity: typeof cleanQty === 'number'
        ? cleanQty
        : Number(pick(row, ['Quantity Traded', 'Quantity', 'Qty']).replace(/,/g, '')) || 0,
      price: Number(pick(row, ['Trade Price / Wght. Avg. Price', 'Trade Price', 'Price', 'WATP']).replace(/,/g, '')) || 0,
      dealType: 'bulk' as const,
      exchange,
      source: 'chittorgarh' as const,
    };
  });
}

// --- handler ---------------------------------------------------------------

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const attempts: Attempt[] = [];
  const now = new Date();

  // --- NSE: official snapshot (bulk + block), Chittorgarh as fallback ------
  let nse: ExchangeDeals;
  try {
    const raw = await fetchNse();
    // snapshot can carry an older "latest block day" than bulk — collapse both
    // to the single most-recent day so we show today's deals only
    const { bulk, block, date } = latestDayBoth(raw.bulk, raw.block);
    attempts.push({ source: 'nse', ok: true, detail: `NSE snapshot: ${raw.bulk.length} bulk + ${raw.block.length} block rows (as on ${raw.asOn ?? 'n/a'}); kept ${bulk.length}+${block.length} for ${date ?? 'n/a'}` });
    nse = {
      exchange: 'NSE',
      source: 'nse',
      sourceLabel: 'NSE official API (large-deals snapshot — bulk + block)',
      date: date ?? raw.asOn ?? null,
      bulk,
      block,
    };
  } catch (err: any) {
    attempts.push({ source: 'nse', ok: false, detail: err?.message || String(err) });
    console.error('NSE snapshot fetch failed:', err);
    // fall back to Chittorgarh NSE bulk (no block deals available there)
    try {
      const latest = filterLatestDay(await fetchChittorgarhBulk(now, 'NSE'));
      attempts.push({ source: 'chittorgarh-nse', ok: true, detail: `Chittorgarh NSE bulk: ${latest.deals.length} rows` });
      nse = {
        exchange: 'NSE',
        source: 'chittorgarh',
        sourceLabel: 'Chittorgarh (NSE bulk only — NSE official was unreachable)',
        date: latest.date,
        bulk: latest.deals,
        block: [],
      };
    } catch (err2: any) {
      attempts.push({ source: 'chittorgarh-nse', ok: false, detail: err2?.message || String(err2) });
      console.error('Chittorgarh NSE fallback failed:', err2);
      nse = { exchange: 'NSE', source: 'none', sourceLabel: 'No source reachable', date: null, bulk: [], block: [] };
    }
  }

  // --- BSE: Chittorgarh bulk (BSE block deals are not available here) -------
  let bse: ExchangeDeals;
  try {
    const latest = filterLatestDay(await fetchChittorgarhBulk(now, 'BSE'));
    attempts.push({ source: 'chittorgarh-bse', ok: true, detail: `Chittorgarh BSE bulk: ${latest.deals.length} rows` });
    bse = {
      exchange: 'BSE',
      source: 'chittorgarh',
      sourceLabel: 'Chittorgarh (BSE bulk)',
      date: latest.date,
      bulk: latest.deals,
      block: [],
    };
  } catch (err: any) {
    attempts.push({ source: 'chittorgarh-bse', ok: false, detail: err?.message || String(err) });
    console.error('Chittorgarh BSE fetch failed:', err);
    bse = { exchange: 'BSE', source: 'none', sourceLabel: 'No source reachable', date: null, bulk: [], block: [] };
  }

  const exchanges = [nse, bse];
  const anySucceeded = exchanges.some(e => e.source !== 'none');

  return res.status(anySucceeded ? 200 : 502).json({
    exchanges,
    attempts,
    ...(anySucceeded ? {} : { error: 'Could not fetch bulk/block deals from any source' }),
  });
}

export default withAuth(handler);
