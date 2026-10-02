// Builds the F&O dashboard from the stored broker reports.
//
// Reports are end-of-day snapshots (one per account per day). Between
// uploads, legs are re-priced from the live spot of their underlying:
// futures move with spot, options by their delta (from the implied
// volatility of the report's closing price). Each upload resets them to
// the broker's exact numbers.
//
// Daily P&L for a report day = realised that day + unrealised now −
// unrealised in the previous report, per contract. Nuvama's averages
// include charges, so this is net of charges.

import { getCache, setCache, getGridKeyData, getPortfolioData } from '../queries';
import { fetchHoldingQuote, fetchYahooQuote, mapWithLimit, LiveQuote } from '../livePrices';
import { getCachedPrices } from '../livePriceCache';
import { getLotSizes, lotSizeFor, getVarRates } from './nse';
import { getSpanRates } from './span';
import { getReportsSince, getTradesBetween, getPurposes, getMarginEntries, getHoldings, StoredReport } from './queries';
import { FoDashboard, DashLeg, DashUnderlying, ReportLeg, Purpose, FO_PORTFOLIO } from './types';

const INDEX_TICKERS: Record<string, string> = {
  NIFTY: '^NSEI', BANKNIFTY: '^NSEBANK', FINNIFTY: 'NIFTY_FIN_SERVICE.NS', MIDCPNIFTY: 'NIFTY_MID_SELECT.NS', NIFTYNXT50: '^NSMIDCP',
};
// Exposure margin on top of SPAN, as a share of notional (matched Nuvama within ~2%).
const EXPOSURE = { index: 0.02, stock: 0.05 };
// Margin rate when neither SPAN nor VaR rates are available.
const FALLBACK_RATE = { index: 0.12, stock: 0.2 };
const RISK_FREE = 0.065;
const SPOT_MAX_AGE_MS = 2 * 60 * 1000;

const istDate = (ms: number) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- quotes ----------

/** Live quotes for F&O underlyings and the account's holdings, each reused for up to two minutes. */
export async function getSpotQuotes(symbols: { nse: string | null; bse: string | null }[]): Promise<Record<string, LiveQuote>> {
  const keyOf = (s: { nse: string | null; bse: string | null }) => (s.nse || s.bse || '').toUpperCase();
  const cached = (await getCache<Record<string, { q: LiveQuote; at: number }>>('fo:spots')) || {};
  const fresh = (k: string) => cached[k] && Date.now() - cached[k].at < SPOT_MAX_AGE_MS;
  const missing = [...new Map(symbols.filter(s => keyOf(s) && !fresh(keyOf(s))).map(s => [keyOf(s), s])).values()];
  if (missing.length) {
    const quotes = await mapWithLimit(missing, 8, s => {
      const idx = s.nse ? INDEX_TICKERS[s.nse.toUpperCase()] : undefined;
      return idx ? fetchYahooQuote(idx) : fetchHoldingQuote(s.nse, s.bse);
    });
    missing.forEach((s, i) => { if (quotes[i]) cached[keyOf(s)] = { q: quotes[i]!, at: Date.now() }; });
    await setCache('fo:spots', cached, 24 * 60 * 60);
  }
  return Object.fromEntries(Object.entries(cached).map(([k, v]) => [k, v.q]));
}

// ---------- Black–Scholes ----------

function normCdf(x: number): number {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

function bs(type: 'CE' | 'PE', S: number, K: number, T: number, vol: number): { price: number; delta: number } {
  const sq = vol * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (RISK_FREE + vol * vol / 2) * T) / sq;
  const d2 = d1 - sq;
  const disc = Math.exp(-RISK_FREE * T);
  return type === 'CE'
    ? { price: S * normCdf(d1) - K * disc * normCdf(d2), delta: normCdf(d1) }
    : { price: K * disc * normCdf(-d2) - S * normCdf(-d1), delta: normCdf(d1) - 1 };
}

/** Delta from the option's own price (implied vol by bisection). */
function optionDelta(type: 'CE' | 'PE', price: number, S: number, K: number, T: number): number {
  let lo = 0.01, hi = 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (bs(type, S, K, T, mid).price > price) hi = mid; else lo = mid;
  }
  return bs(type, S, K, T, (lo + hi) / 2).delta;
}

/** Years from `fromMs` to 15:30 IST on the expiry date. */
function yearsToExpiry(expiry: string, fromMs: number): number {
  const expiryMs = Date.parse(`${expiry}T15:30:00+05:30`);
  return Math.max((expiryMs - fromMs) / (365 * 86400e3), 1 / (365 * 24));
}

// ---------- purposes ----------

export function defaultPurpose(leg: Pick<ReportLeg, 'type' | 'qty'>, sharesHeld: number): Purpose {
  if (leg.type === 'FUT') return leg.qty < 0 && sharesHeld > 0 ? 'Hedge' : 'Directional';
  if (leg.type === 'CE') return leg.qty < 0 ? 'Income' : 'Directional';
  return leg.qty > 0 ? 'Hedge' : 'Income';
}

// ---------- book ----------

async function publicBookValue(): Promise<number | null> {
  const [holdings, screener, live] = await Promise.all([getGridKeyData(), getPortfolioData(), getCachedPrices()]);
  if (!holdings?.length) return null;
  const screenerPrice = new Map<string, number>();
  for (const s of screener || []) {
    if (!s.currentPrice) continue;
    if (s.nseCode) screenerPrice.set(String(s.nseCode).toLowerCase(), s.currentPrice);
    if (s.bseCode) screenerPrice.set(String(s.bseCode).toLowerCase(), s.currentPrice);
  }
  let total = 0;
  for (const h of holdings) {
    const keys = [h.nseCode, h.bseCode].filter(Boolean).map((k: string) => String(k).toLowerCase());
    const price = keys.map(k => live?.prices[k]?.price).find(Boolean) ?? keys.map(k => screenerPrice.get(k)).find(Boolean);
    if (price) total += (Number(h.quantity) || 0) * price;
  }
  return total > 0 ? total : null;
}

// ---------- dashboard ----------

export async function buildDashboard(now = Date.now()): Promise<FoDashboard> {
  const today = istDate(now);
  const since = istDate(now - 70 * 86400e3);
  const [reports, purposes, margins, foHoldings, lots, varRates, book, span] = await Promise.all([
    getReportsSince(since), getPurposes(), getMarginEntries(), getHoldings(FO_PORTFOLIO), getLotSizes(), getVarRates(), publicBookValue(),
    getSpanRates().catch(() => null),
  ]);

  const byAccount = new Map<string, StoredReport[]>();
  for (const r of reports) byAccount.set(r.account, [...(byAccount.get(r.account) || []), r]);
  const accounts = [...byAccount.keys()];
  const latest = accounts.map(a => byAccount.get(a)!.at(-1)!);
  const asOf = latest.length ? latest.map(r => r.asOf).sort().at(-1)! : null;

  // One F&O account for now, holding FO_PORTFOLIO's shares; all of them count as pledged.
  const holdings = (foHoldings?.holdings || []).map(h => ({ h }));
  const heldQty = (_account: string, sym: string) => holdings
    .filter(x => x.h.nseCode?.toUpperCase() === sym)
    .reduce((s, x) => s + x.h.quantity, 0);

  const openLegs = latest.flatMap(r => r.legs.filter(l => l.qty !== 0).map(l => ({ account: r.account, report: r, leg: l })));
  const underlyingSyms = [...new Set(openLegs.map(x => x.leg.underlying))];
  const quotes = await getSpotQuotes([
    ...underlyingSyms.map(s => ({ nse: s, bse: null })),
    ...holdings.map(x => ({ nse: x.h.nseCode, bse: x.h.bseCode })),
  ]);

  // Futures: |qty| × price × (SPAN % + exposure %). Options (and futures with no
  // SPAN rate) fall back to an NSE VaR estimate and mark margin as estimated.
  const fallbackRate = (sym: string) => {
    const r = varRates?.[sym]?.applicable;
    return r ? r / 100 : INDEX_TICKERS[sym] ? FALLBACK_RATE.index : FALLBACK_RATE.stock;
  };
  let marginEstimated = false;
  const legMargin = (leg: ReportLeg, price: number) => {
    if (leg.type !== 'FUT' && leg.qty > 0) return 0; // long options: premium paid upfront
    const spanPct = leg.type === 'FUT' ? span?.rates[leg.underlying] : undefined;
    if (spanPct == null) marginEstimated = true;
    const rate = spanPct != null ? spanPct + (INDEX_TICKERS[leg.underlying] ? EXPOSURE.index : EXPOSURE.stock) : fallbackRate(leg.underlying);
    return Math.abs(leg.qty) * price * rate;
  };

  // ---- legs ----
  let pricedAt: number | null = null;
  const reportDayPnl = dailyPnl(byAccount); // date → account|contract → pnl
  const legs: DashLeg[] = openLegs.map(({ account, report, leg }) => {
    const q = quotes[leg.underlying];
    const atUpload = report.spots?.[leg.underlying];
    // Spot at the report's close, and whether the market has traded since.
    const s0 = atUpload && istDate(atUpload.time) === report.asOf ? atUpload.price
      : q && istDate(q.time) > report.asOf ? q.prevClose
      : q?.price ?? null;
    const live = !!(q && s0 && istDate(q.time) > report.asOf);
    const s1 = q?.price ?? s0;
    if (live) pricedAt = Math.max(pricedAt ?? 0, q!.time);

    let delta = 1;
    if (leg.type !== 'FUT') {
      delta = s0 && leg.strike && leg.ltp > 0
        ? optionDelta(leg.type, leg.ltp, s0, leg.strike, yearsToExpiry(leg.expiry, Date.parse(`${report.asOf}T15:30:00+05:30`)))
        : leg.type === 'CE' ? 0.5 : -0.5;
    }
    const ltp = !live ? leg.ltp
      : leg.type === 'FUT' ? leg.ltp * (s1! / s0!)
      : Math.max(0, leg.ltp + delta * (s1! - s0!));
    const key = `${account}|${leg.contract}`;
    const dayPnl = live ? (ltp - leg.ltp) * leg.qty
      : reportDayPnl.get(report.asOf)?.get(key) ?? leg.dayPnl;
    const held = heldQty(account, leg.underlying);
    const lot = lotSizeFor(lots, leg.underlying, leg.expiry);
    return {
      account,
      contract: leg.contract, underlying: leg.underlying, type: leg.type, expiry: leg.expiry, strike: leg.strike,
      purpose: purposes[key] ?? defaultPurpose(leg, held),
      purposeIsDefault: !purposes[key],
      qty: leg.qty,
      lots: lot ? leg.qty / lot : null,
      avg: leg.avg,
      ltp, ltpIsEstimate: live,
      today: dayPnl ?? null,
      openPnl: (ltp - leg.avg) * leg.qty,
      deltaRs: delta * leg.qty * (leg.type === 'FUT' ? ltp : (s1 ?? leg.strike ?? 0)),
      margin: legMargin(leg, leg.type === 'FUT' ? ltp : (s1 ?? ltp)),
    };
  });

  // ---- margin ----
  // Limits utilised, as Nuvama counts it: SPAN + exposure, plus the day's
  // unsettled MTM loss (futures settle daily; a profit isn't credited).
  const spanExposure = legs.reduce((s, l) => s + l.margin, 0);
  const mtm = legs.filter(l => l.type === 'FUT').reduce((s, l) => s + (l.today ?? 0), 0);
  const mtmLoss = Math.max(0, -mtm);
  const used = spanExposure + mtmLoss;
  let cash = 0, pledgedSum = 0, pledgedMissing = false, enteredMs = 0;
  for (const account of accounts) {
    const m = margins[account];
    cash += m?.cash ?? 0;
    if (m?.pledged != null) pledgedSum += m.pledged; else pledgedMissing = true;
    if (m?.updatedAt) enteredMs = Math.max(enteredMs, new Date(m.updatedAt).getTime());
  }
  const pledged = accounts.length && !pledgedMissing ? pledgedSum : null;

  const collateral = holdings.flatMap(({ h }) => {
    const q = quotes[(h.nseCode || h.bseCode || '').toUpperCase()];
    if (!q || h.quantity <= 0) return [];
    const rate = h.nseCode ? varRates?.[h.nseCode.toUpperCase()]?.applicable : undefined;
    const haircutPct = rate ?? 100; // not in NSE's list: can't be pledged
    const marketValue = h.quantity * q.price;
    return [{
      name: h.name, sub: `${h.quantity.toLocaleString('en-IN')} shares`,
      marketValue, haircutPct, value: marketValue * (1 - haircutPct / 100),
      cashLike: /liquid/i.test(`${h.name} ${h.nseCode ?? ''}`),
    }];
  }).sort((a, b) => b.value - a.value);
  // Nuvama applies its own haircuts, so its pledged figure wins; NSE haircuts are the fallback.
  const available = cash + (pledged ?? collateral.reduce((s, c) => s + c.value, 0));
  const cashForRule = cash + collateral.filter(c => c.cashLike).reduce((s, c) => s + c.value, 0);

  // ---- underlyings ----
  const underlyings: DashUnderlying[] = underlyingSyms.map(sym => {
    const q = quotes[sym];
    const mine = legs.filter(l => l.underlying === sym);
    const held = heldQty('', sym);
    const cover = mine.filter(l => l.purpose === 'Hedge' || l.purpose === 'Income');
    return {
      symbol: sym,
      spot: q?.price ?? null,
      spotChangePct: q?.changePct ?? null,
      sharesHeld: held > 0 ? held : null,
      hedgedPct: held > 0 && cover.length ? cover.reduce((s, l) => s + Math.abs(l.qty), 0) / held * 100 : null,
      coverKind: held > 0 && cover.length ? (cover.every(l => l.type === 'CE' && l.qty < 0) ? 'covered' : 'hedged') : null,
    };
  });

  // ---- month P&L ----
  const liveToday = legs.some(l => l.ltpIsEstimate) && asOf != null && today > asOf;
  const monthKey = (liveToday ? today : asOf ?? today).slice(0, 7);
  let month: FoDashboard['month'] = null;
  if (asOf) {
    const contractInfo = new Map<string, { underlying: string; purpose: Purpose }>();
    for (const r of reports) for (const l of r.legs) {
      const key = `${r.account}|${l.contract}`;
      contractInfo.set(key, { underlying: l.underlying, purpose: purposes[key] ?? defaultPurpose(l, heldQty(r.account, l.underlying)) });
    }
    const perContract = new Map<string, number>();
    const days: { date: string; pnl: number; live: boolean }[] = [];
    for (const [date, m] of [...reportDayPnl.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (!date.startsWith(monthKey)) continue;
      let sum = 0;
      for (const [key, v] of m) { sum += v; perContract.set(key, (perContract.get(key) ?? 0) + v); }
      days.push({ date, pnl: sum, live: false });
    }
    if (liveToday && today.startsWith(monthKey)) {
      let sum = 0;
      for (const l of legs) {
        const v = l.today ?? 0;
        sum += v;
        const key = `${l.account}|${l.contract}`;
        perContract.set(key, (perContract.get(key) ?? 0) + v);
      }
      days.push({ date: today, pnl: sum, live: true });
    }
    const open = new Set(legs.map(l => `${l.account}|${l.contract}`));
    const byU = new Map<string, number>();
    let closed = 0;
    const byPurpose: Record<Purpose, number> = { Hedge: 0, Income: 0, Directional: 0 };
    for (const [key, v] of perContract) {
      const info = contractInfo.get(key);
      if (open.has(key) && info) byU.set(info.underlying, (byU.get(info.underlying) ?? 0) + v);
      else closed += v;
      if (info) byPurpose[info.purpose] += v;
    }
    const [y, mo] = monthKey.split('-').map(Number);
    const monthEnd = istDate(Date.UTC(y, mo, 0));
    const trades = await getTradesBetween(`${monthKey}-01`, monthEnd);
    month = {
      key: monthKey,
      label: MONTH_NAMES[mo - 1],
      charges: trades.reduce((s, t) => s + t.charges, 0),
      net: days.reduce((s, d) => s + d.pnl, 0),
      days,
      byUnderlying: [...byU.entries()].map(([name, pnl]) => ({ name, pnl })).sort((a, b) => b.pnl - a.pnl),
      closed,
      byPurpose,
    };
  }

  // ---- next expiry ----
  const expiries = [...new Set(legs.map(l => l.expiry))].sort();
  const nextExpiry = expiries.length
    ? { date: expiries[0], legs: legs.filter(l => l.expiry === expiries[0]).length, days: daysBetween(today, expiries[0]) }
    : null;

  return {
    accounts,
    asOf,
    pricedAt: pricedAt ? new Date(pricedAt).toISOString() : null,
    legs,
    underlyings,
    book,
    month,
    margin: {
      used, spanExposure, mtmLoss, isEstimate: marginEstimated, spanAsOf: span?.fileDate ?? null, enteredOn: enteredMs ? new Date(enteredMs).toISOString() : null, cash, pledged,
      holdingsValue: collateral.reduce((s, c) => s + c.marketValue, 0), collateral, available, cashForRule,
    },
    nextExpiry,
  };
}

/** date → (account|contract → that day's P&L), from consecutive reports of each account. */
function dailyPnl(byAccount: Map<string, StoredReport[]>): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const [account, reps] of byAccount) {
    for (let i = 0; i < reps.length; i++) {
      const cur = reps[i], prev = reps[i - 1];
      const m = out.get(cur.asOf) ?? new Map<string, number>();
      if (prev) {
        const prevU = new Map(prev.legs.map(l => [l.contract, l.unrealised]));
        const contracts = new Set([...cur.legs.map(l => l.contract), ...prev.legs.filter(l => l.qty !== 0).map(l => l.contract)]);
        const curBy = new Map(cur.legs.map(l => [l.contract, l]));
        for (const c of contracts) {
          const l = curBy.get(c);
          m.set(`${account}|${c}`, (l?.realised ?? 0) + (l?.unrealised ?? 0) - (prevU.get(c) ?? 0));
        }
      } else {
        // First report on record: only the broker's own day P&L is usable.
        for (const l of cur.legs) if (l.dayPnl != null) m.set(`${account}|${l.contract}`, l.dayPnl);
      }
      if (m.size) out.set(cur.asOf, m);
    }
  }
  return out;
}
