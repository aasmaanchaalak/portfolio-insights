// End-of-day market positioning for the F&O page, from three NSE files:
// - participant-wise F&O open interest (Client / DII / FII / Pro long and
//   short contracts): fao_participant_oi_DDMMYYYY.csv
// - advance / decline from the CM bhavcopy, mainboard equities only
//   (EQ/BE/BZ series with an INE ISIN, so ETFs, SME, bonds and SGBs are out;
//   this matches NSE's own published breadth)
// - market-wide MTF book from the Margin Trading Disclosure,
//   mrg_trading_DDMMYY.zip (NSE only; lags a day: the file for day D comes out
//   on D+1)
//
// Filled by /api/cron/market-data (GitHub Actions, ~18:30 IST on weekdays),
// with a throttled refresh when the F&O page finds the latest day missing.
// Each run fills any missing day in the last year (newest first, within a time
// budget), so a fresh deployment gets a year of history in a run or two and a
// missed run catches up the next day.

import { unzipSync, strFromU8 } from 'fflate';
import { getCache, setCache } from '../queries';

/**
 * NSE archive hosts, tried in order. NSE is moving archives to nsearchives;
 * the old host still serves the same paths and answers when the new one
 * rate-limits (403). Change the order or drop one here.
 */
export const NSE_ARCHIVE_HOSTS = ['https://nsearchives.nseindia.com', 'https://archives.nseindia.com'];
const path = {
  participantOi: (d: string) => `/content/nsccl/fao_participant_oi_${dmy(d)}.csv`,
  bhavcopy: (d: string) => `/content/cm/BhavCopy_NSE_CM_0_0_0_${d.replace(/-/g, '')}_F_0000.csv.zip`,
  mtf: (d: string) => `/content/equities/mrg_trading_${dmy(d).slice(0, 4)}${d.slice(2, 4)}.zip`,
};

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
const KEY = 'fo:market-data';
const CHECKED_KEY = 'fo:market-data-checked';
const RECHECK_SECONDS = 60 * 60;   // page-triggered refresh at most hourly
const BACKFILL_DAYS = 380;         // calendar days to fill (a year of sessions for percentiles)
const KEEP_DAYS = 400;             // calendar days kept
const GIVE_UP_AFTER_DAYS = 4;      // a file still missing this long after its day isn't coming
const TIME_BUDGET_MS = 45_000;     // stay under the function's 60s limit

export const PARTICIPANTS = ['Client', 'DII', 'FII', 'Pro'] as const;
export type Participant = typeof PARTICIPANTS[number];

/** Open contracts for one participant category. */
export interface ParticipantOi {
  futIdxLong: number; futIdxShort: number;
  futStkLong: number; futStkShort: number;
  idxCallLong: number; idxPutLong: number; idxCallShort: number; idxPutShort: number;
  stkCallLong: number; stkPutLong: number; stkCallShort: number; stkPutShort: number;
}
export interface Breadth { advances: number; declines: number; unchanged: number }
/** ₹ lakh, as NSE reports it. */
export interface MtfBook { outstanding: number; fresh: number; liquidated: number }

export interface MarketData {
  oi: Record<string, Record<Participant, ParticipantOi>>;  // by YYYY-MM-DD
  breadth: Record<string, Breadth>;
  mtf: Record<string, MtfBook>;
  /** "source:date" pairs that 404'd for too long (holidays, gaps) — not retried. */
  missing: string[];
  updatedAt: string | null;
}

const empty = (): MarketData => ({ oi: {}, breadth: {}, mtf: {}, missing: [], updatedAt: null });

// ---------- dates ----------

const IST_MS = 5.5 * 3600e3;
const istYmd = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);
function dmy(ymd: string) { return ymd.slice(8, 10) + ymd.slice(5, 7) + ymd.slice(0, 4); }
const isWeekday = (ymd: string) => { const d = new Date(ymd + 'T00:00:00Z').getUTCDay(); return d !== 0 && d !== 6; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);

/** The latest weekday whose end-of-day files should be out: today after 19:00 IST, else the weekday before. */
export function expectedLatestDay(now = Date.now()): string {
  const ist = new Date(now + IST_MS);
  let ms = now;
  if (!(isWeekday(istYmd(ms)) && ist.getUTCHours() >= 19)) ms -= 86400e3;
  while (!isWeekday(istYmd(ms))) ms -= 86400e3;
  return istYmd(ms);
}

// ---------- parsers ----------

const num = (s: string | undefined) => { const n = parseFloat((s ?? '').replace(/[",\s]/g, '')); return Number.isFinite(n) ? n : 0; };
const splitCsv = (line: string) => line.split(',').map(s => s.trim().replace(/^"+|"+$/g, ''));

const OI_COLS: Record<string, keyof ParticipantOi> = {
  'future index long': 'futIdxLong', 'future index short': 'futIdxShort',
  'future stock long': 'futStkLong', 'future stock short': 'futStkShort',
  'option index call long': 'idxCallLong', 'option index put long': 'idxPutLong',
  'option index call short': 'idxCallShort', 'option index put short': 'idxPutShort',
  'option stock call long': 'stkCallLong', 'option stock put long': 'stkPutLong',
  'option stock call short': 'stkCallShort', 'option stock put short': 'stkPutShort',
};

export function parseParticipantOi(csv: string): Record<Participant, ParticipantOi> | null {
  const lines = csv.split(/\r?\n/).map(splitCsv);
  const h = lines.findIndex(c => c[0]?.toLowerCase() === 'client type');
  if (h < 0) return null;
  const idx = lines[h].map(c => OI_COLS[c.toLowerCase().replace(/\s+/g, ' ')]);
  const out: Partial<Record<Participant, ParticipantOi>> = {};
  for (const cols of lines.slice(h + 1)) {
    const who = PARTICIPANTS.find(p => p.toLowerCase() === cols[0]?.toLowerCase());
    if (!who) continue;
    const row = {} as ParticipantOi;
    idx.forEach((k, i) => { if (k) row[k] = num(cols[i]); });
    out[who] = row;
  }
  return PARTICIPANTS.every(p => out[p] && out[p]!.futIdxLong + out[p]!.futIdxShort > 0) ? out as Record<Participant, ParticipantOi> : null;
}

const MAINBOARD_SERIES = new Set(['EQ', 'BE', 'BZ']);

export function parseBreadth(csv: string): Breadth | null {
  const lines = csv.split(/\r?\n/);
  const head = splitCsv(lines[0] || '');
  const c = (n: string) => head.indexOf(n);
  const [series, isin, close, prev] = [c('SctySrs'), c('ISIN'), c('ClsPric'), c('PrvsClsgPric')];
  if ([series, isin, close, prev].some(i => i < 0)) return null;
  const b: Breadth = { advances: 0, declines: 0, unchanged: 0 };
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    if (!MAINBOARD_SERIES.has(cols[series]) || !cols[isin]?.startsWith('INE')) continue;
    const cl = num(cols[close]), pv = num(cols[prev]);
    if (!(cl > 0 && pv > 0)) continue;
    if (cl > pv) b.advances++; else if (cl < pv) b.declines++; else b.unchanged++;
  }
  return b.advances + b.declines > 500 ? b : null;
}

export function parseMtf(csv: string): MtfBook | null {
  const lines = csv.split(/\r?\n/).map(splitCsv);
  const find = (re: RegExp) => { const r = lines.find(c => re.test(c[1] || '')); return r ? num(r[2]) : null; };
  let outstanding = find(/^net scripwise outstanding at the end of the day/i);
  const fresh = find(/^fresh exposure taken during the day/i) ?? 0;
  const liquidated = find(/^exposure liquidated during the day/i) ?? 0;
  if (outstanding == null) {
    // No summary rows: total the scrip-wise amounts financed (₹ lakh, last column).
    const h = lines.findIndex(c => c[0]?.toLowerCase() === 'symbol');
    if (h < 0) return null;
    outstanding = lines.slice(h + 1).filter(c => c[0] && c.length >= 4).reduce((s, c) => s + num(c[3]), 0);
  }
  return outstanding > 0 ? { outstanding, fresh, liquidated } : null;
}

// ---------- downloads ----------

async function getFrom(u: string): Promise<Uint8Array | null> {
  const res = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // NSE serves a 200 HTML page for some missing files.
  if (buf[0] === 0x3c /* < */ && strFromU8(buf.subarray(0, 200)).toLowerCase().includes('<html')) return null;
  return buf;
}
/** The file from the first host that answers; null when it doesn't exist (yet). */
async function get(p: string): Promise<Uint8Array | null> {
  let lastErr: any;
  for (const host of NSE_ARCHIVE_HOSTS) {
    try { return await getFrom(host + p); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
function csvFromZip(buf: Uint8Array): string | null {
  const files = unzipSync(buf, { filter: f => f.name.toLowerCase().endsWith('.csv') });
  const f = Object.values(files)[0];
  return f ? strFromU8(f) : null;
}

type Source = 'oi' | 'breadth' | 'mtf';
const fetchers: Record<Source, (d: string) => Promise<any | null>> = {
  oi: async d => { const b = await get(path.participantOi(d)); return b && parseParticipantOi(strFromU8(b)); },
  breadth: async d => { const b = await get(path.bhavcopy(d)); const csv = b && csvFromZip(b); return csv && parseBreadth(csv); },
  mtf: async d => { const b = await get(path.mtf(d)); const csv = b && csvFromZip(b); return csv && parseMtf(csv); },
};

async function fill(data: MarketData): Promise<{ added: string[]; errors: string[]; remaining: number }> {
  const today = istYmd(Date.now());
  const deadline = Date.now() + TIME_BUDGET_MS;
  const missing = new Set(data.missing);
  const jobs: { src: Source; date: string }[] = [];
  for (let back = 0; back < BACKFILL_DAYS; back++) {
    const date = istYmd(Date.now() - back * 86400e3);
    if (!isWeekday(date)) continue;
    if (missing.has(`oi:${date}`) && back > 0) continue; // a holiday: nothing to fetch for it
    for (const src of ['oi', 'breadth', 'mtf'] as Source[]) {
      if (data[src][date] || missing.has(`${src}:${date}`)) continue;
      if (src === 'mtf' && date === today) continue; // published the next day
      jobs.push({ src, date });
    }
  }

  // NSE answers 403 when hit too fast: back off and retry, and stop the run if
  // it keeps refusing (the next run carries on from where this one stopped).
  const added: string[] = [], errors: string[] = [];
  let next = 0, pauseUntil = 0, refusals = 0, stopped = false;
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const worker = async () => {
    while (!stopped && next < jobs.length && Date.now() < deadline) {
      if (Date.now() < pauseUntil) { await sleep(pauseUntil - Date.now()); continue; }
      const job = jobs[next++];
      const { src, date } = job;
      try {
        const v = await fetchers[src](date);
        refusals = 0;
        if (v) { (data[src] as any)[date] = v; added.push(`${src}:${date}`); }
        else if (daysBetween(date, today) >= GIVE_UP_AFTER_DAYS) missing.add(`${src}:${date}`);
      } catch (e: any) {
        if (/HTTP 403/.test(e?.message) && ++refusals <= 4) {
          pauseUntil = Date.now() + 4000 * refusals;
          jobs.push(job); // retry later in this run
          continue;
        }
        if (refusals > 4) stopped = true;
        errors.push(`${src}:${date} ${e?.message}`);
      }
      await sleep(120);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  if (stopped) errors.push('NSE refused repeated requests; stopped early, will resume next run');

  // Keep a rolling window.
  const cutoff = istYmd(Date.now() - KEEP_DAYS * 86400e3);
  for (const src of ['oi', 'breadth', 'mtf'] as Source[]) {
    for (const d of Object.keys(data[src])) if (d < cutoff) delete (data[src] as any)[d];
  }
  data.missing = [...missing].filter(k => k.slice(k.indexOf(':') + 1) >= cutoff);
  return { added, errors, remaining: Math.max(0, jobs.length - next) };
}

// ---------- public ----------

export async function getMarketData(): Promise<MarketData> {
  return (await getCache<MarketData>(KEY)) || empty();
}

/** True when the latest day's participant OI or breadth isn't stored yet. */
export function isStale(data: MarketData, now = Date.now()): boolean {
  const want = expectedLatestDay(now);
  if (data.missing.includes(`oi:${want}`)) return false;
  return !data.oi[want] || !data.breadth[want];
}

type RefreshResult = { data: MarketData; added: string[]; errors: string[]; remaining: number };
let inflight: Promise<RefreshResult> | null = null;

/**
 * Fetch any missing days from NSE and store them. `force` (the cron) always
 * runs; otherwise at most once an hour.
 */
export function refreshMarketData(force = false): Promise<RefreshResult> {
  if (inflight) return inflight;
  inflight = (async () => {
    const data = await getMarketData();
    if (!force && await getCache(CHECKED_KEY)) return { data, added: [], errors: [], remaining: 0 };
    await setCache(CHECKED_KEY, true, RECHECK_SECONDS);
    const { added, errors, remaining } = await fill(data);
    if (added.length || !data.updatedAt) data.updatedAt = new Date().toISOString();
    await setCache(KEY, data); // also keeps the `missing` list current
    if (errors.length) console.warn('[fo] market data fetch errors:', errors.slice(0, 5).join('; '));
    return { data, added, errors, remaining };
  })().finally(() => { inflight = null; });
  return inflight;
}
