// NSE reference files for the F&O page, cached in the database:
// - lot sizes per underlying and expiry month (fo_mktlots.csv)
// - daily VaR margin rates (NSE Clearing C_VAR1 file), used as collateral
//   haircuts and to estimate margin when none has been entered

import { getCache, setCache } from '../queries';

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};
const REFRESH_SECONDS = 12 * 60 * 60;

/** symbol → { "OCT-26": 75, ... } */
export type LotSizes = Record<string, Record<string, number>>;

export async function getLotSizes(): Promise<LotSizes | null> {
  const cached = await getCache<LotSizes>('fo:lot-sizes');
  if (cached) return cached;
  try {
    const res = await fetch('https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv', {
      headers: NSE_HEADERS, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lines = (await res.text()).split(/\r?\n/).map(l => l.split(',').map(s => s.trim()));
    const head = lines[0] || [];
    const lots: LotSizes = {};
    for (const cols of lines.slice(1)) {
      const sym = (cols[1] || '').toUpperCase();
      if (!sym || sym === 'SYMBOL') continue;
      const byMonth: Record<string, number> = {};
      for (let i = 2; i < head.length; i++) {
        const n = parseInt(cols[i], 10);
        if (n > 0) byMonth[head[i].toUpperCase()] = n;
      }
      lots[sym] = byMonth;
    }
    await setCache('fo:lot-sizes', lots, REFRESH_SECONDS);
    return lots;
  } catch (e: any) {
    console.warn(`[fo] NSE lot sizes unavailable: ${e?.message}`);
    return null;
  }
}

/** Lot size for a contract expiring on `expiry` (YYYY-MM-DD). */
export function lotSizeFor(lots: LotSizes | null, symbol: string, expiry: string): number | null {
  const byMonth = lots?.[symbol.toUpperCase()];
  if (!byMonth) return null;
  const [y, m] = expiry.split('-');
  const key = `${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][Number(m) - 1]}-${y.slice(2)}`;
  return byMonth[key] ?? Object.values(byMonth)[0] ?? null;
}

/** symbol (EQ series) → VaR rates in %. `applicable` = VaR + extreme loss margin. */
export type VarRates = Record<string, { var: number; applicable: number }>;

function ddmmyyyy(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600e3);
  return `${String(ist.getUTCDate()).padStart(2, '0')}${String(ist.getUTCMonth() + 1).padStart(2, '0')}${ist.getUTCFullYear()}`;
}

export async function getVarRates(): Promise<VarRates | null> {
  const cached = await getCache<VarRates>('fo:var-rates');
  if (cached) return cached;
  // The file is published each trading day; walk back past weekends and holidays.
  for (let back = 0; back < 8; back++) {
    const day = ddmmyyyy(new Date(Date.now() - back * 86400e3));
    try {
      const res = await fetch(`https://nsearchives.nseindia.com/archives/nsccl/var/C_VAR1_${day}_1.DAT`, {
        headers: NSE_HEADERS, signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const rates: VarRates = {};
      for (const line of (await res.text()).split(/\r?\n/)) {
        // 20,SYMBOL,SERIES,ISIN,secVaR,indexVaR,VaRMargin,ELM,adhoc,applicable
        const c = line.split(',');
        if (c[0] !== '20' || c[2] !== 'EQ') continue;
        const v = parseFloat(c[6]), a = parseFloat(c[9]);
        if (Number.isFinite(a)) rates[c[1].toUpperCase()] = { var: Number.isFinite(v) ? v : a, applicable: a };
      }
      if (Object.keys(rates).length === 0) continue;
      await setCache('fo:var-rates', rates, REFRESH_SECONDS);
      return rates;
    } catch (e: any) {
      console.warn(`[fo] NSE VaR file ${day} unavailable: ${e?.message}`);
    }
  }
  return null;
}
