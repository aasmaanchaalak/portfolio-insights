// Transactions upload for PF Data: apply buys and sells (e.g. GridKey's
// transaction report, one file per portfolio) to the last holdings snapshot,
// instead of uploading a complete PF export.
//
// - Buys add quantity at their cost (amount incl. brokerage; qty × price when
//   no amount), so the average buy price is the weighted average. Bonus shares
//   add quantity at zero cost. Sells reduce quantity and leave the average.
//   Dividends and other cash-only rows are ignored.
// - Each applied transaction is recorded (pf_transactions, by fingerprint), so
//   uploading the same report or an overlapping range never applies it twice.
// - The report's running "Bal Qty" is the broker's quantity after each trade
//   in that account. With per-account holdings (combined PF exports with a
//   Portfolio column): if the account already shows that balance, the trade
//   is in the last full PF upload and is skipped; if it shows neither the
//   before nor the after balance, the report wins and the quantity is set to
//   Bal Qty (flagged). Without per-account holdings, rows dated before the last
//   full PF upload are taken to be in it already.
// - Asset names are NSE symbols or company names; they're matched to holdings
//   and Screener data, and names that can't be matched are mapped by hand once
//   (remembered for next time).

import { query, queryOne } from './db';
import { getGridKeyData, getPortfolioData, getPrivateInvestments, getCache, setCache } from './queries';
import { getAccountHoldings } from './accounts';
import { saveHoldingsSnapshot, AccountRowInput, DatePriceHints, SnapshotResult } from './pfSnapshot';

export interface TxnInput {
  portfolio: string;      // account name as in the PF export ('' when unknown)
  date: string;           // YYYY-MM-DD
  type: string;           // BUY, SELL, BONUS, DIVIDEND, ...
  asset: string;          // NSE symbol or company name, as in the report
  quantity: number;
  price: number;
  brokerage: number;
  amount: number | null;
  balQty: number | null;  // broker's running balance after this row
}

export interface AssetRef { code: string; nseCode: string | null; bseCode: string | null; name: string }

export interface TxnChange {
  portfolio: string;
  code: string;
  name: string;
  qtyBefore: number;
  avgBefore: number | null;
  qtyAfter: number;
  avgAfter: number | null;
  buys: number;            // applied rows
  sells: number;
  skippedInHoldings: number;
  isNew: boolean;          // not held before (in this account)
  isExit: boolean;         // nothing left (in this account)
  balMismatch: { expected: number; had: number; date: string } | null;
}

export interface TxnPlan {
  mode: 'accounts' | 'combined';   // per-account rows, or the merged holdings only
  total: number;
  toApply: number;
  duplicates: number;              // applied in an earlier upload
  inHoldings: number;              // already reflected in the last full PF upload
  ignored: { type: string; count: number }[];
  unknownTypes: { type: string; count: number }[];
  unresolved: string[];            // asset names that need a code
  unknownPortfolios: string[];     // portfolios not in the last PF upload (accounts mode)
  changes: TxnChange[];
  lastPfUpload: string | null;
}

const BUY = new Set(['BUY', 'B', 'PURCHASE', 'IPO', 'ALLOTMENT', 'IPO ALLOTMENT', 'TRANSFER IN', 'TRANSFER_IN', 'RIGHTS', 'RIGHTS ISSUE']);
const SELL = new Set(['SELL', 'S', 'SALE', 'TRANSFER OUT', 'TRANSFER_OUT', 'BUYBACK', 'BUY BACK', 'OPEN OFFER', 'DELISTING']);
const BONUS = new Set(['BONUS', 'BONUS ISSUE']);
const IGNORE = new Set(['DIVIDEND', 'INTEREST', 'TDS', 'CHARGES', 'FEE', 'FEES']);

const ASSET_MAP_KEY = 'pf:txn-asset-map';

let ready = false;
async function ensureTable(): Promise<void> {
  if (ready) return;
  await query(`
    CREATE TABLE IF NOT EXISTS pf_transactions (
      fingerprint VARCHAR(600) PRIMARY KEY,
      portfolio   VARCHAR(255),
      txn_date    DATE NOT NULL,
      txn_type    VARCHAR(40) NOT NULL,
      asset       VARCHAR(255) NOT NULL,
      stock_code  VARCHAR(50),
      quantity    NUMERIC,
      price       NUMERIC,
      amount      NUMERIC,
      bal_qty     NUMERIC,
      outcome     VARCHAR(20) NOT NULL,     -- applied | in_holdings
      applied_by  VARCHAR(255),
      applied_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  ready = true;
}

const normType = (t: string) => String(t || '').trim().toUpperCase().replace(/\s+/g, ' ');
const rowKey = (t: TxnInput) =>
  [t.portfolio.trim().toLowerCase(), t.date, normType(t.type), t.asset.trim().toUpperCase(), t.quantity, t.price, t.amount ?? '', t.balQty ?? ''].join('|');
/**
 * One fingerprint per row; identical rows (two fills of the same size and
 * price on a day) are numbered in file order, so re-uploading the same report
 * gives the same fingerprints and real repeats aren't mistaken for duplicates.
 */
function fingerprints(txns: TxnInput[]): string[] {
  const n = new Map<string, number>();
  return txns.map(t => {
    const k = rowKey(t);
    const i = (n.get(k) ?? 0) + 1;
    n.set(k, i);
    return `${k}#${i}`;
  });
}

/** Lower-case, no punctuation, no "ltd/limited". */
export const normName = (s: string) => String(s || '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\b(ltd|limited|the|inc|co|corp|corporation)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

// ---------- base holdings ----------

interface Pos { name: string; nseCode: string | null; bseCode: string | null; qty: number; cost: number; avg: number | null }
const codeOf = (h: { nseCode: string | null; bseCode: string | null }) => h.nseCode || h.bseCode || '';
const keyOf = (portfolio: string, code: string) => `${portfolio.toLowerCase()}|${code}`;

async function loadBase() {
  const [merged, accounts, gkRow, priv] = await Promise.all([
    getGridKeyData(),
    getAccountHoldings(),
    queryOne<any>(`SELECT updated_at FROM gridkey_data ORDER BY updated_at DESC LIMIT 1`),
    getPrivateInvestments(),
  ]);
  const lastPfUpload: string | null = gkRow?.updated_at ? new Date(gkRow.updated_at).toISOString() : null;
  // Per-account rows are only trusted when saved with the latest holdings.
  const accountsCurrent = !!accounts?.holdings?.length && !!lastPfUpload
    && Math.abs(new Date(accounts.updatedAt).getTime() - new Date(lastPfUpload).getTime()) < 5 * 60e3;

  const positions = new Map<string, Pos>();
  if (accountsCurrent) {
    for (const h of accounts!.holdings) {
      const code = codeOf(h);
      if (!code) continue;
      positions.set(keyOf(h.portfolio, code), {
        name: h.name, nseCode: h.nseCode, bseCode: h.bseCode, qty: Number(h.quantity) || 0,
        cost: (Number(h.quantity) || 0) * (Number(h.averageBuyPrice) || 0), avg: h.averageBuyPrice ?? null,
      });
    }
  } else {
    for (const h of merged || []) {
      const code = codeOf(h);
      if (!code) continue;
      positions.set(keyOf('', code), {
        name: h.scripName, nseCode: h.nseCode, bseCode: h.bseCode, qty: Number(h.quantity) || 0,
        cost: (Number(h.quantity) || 0) * (Number(h.averageBuyPrice) || 0), avg: h.averageBuyPrice ?? null,
      });
    }
  }
  const portfolios = accountsCurrent
    ? new Map(accounts!.holdings.map(h => [h.portfolio.toLowerCase(), h.portfolio] as const))
    : new Map<string, string>();
  return { mode: (accountsCurrent ? 'accounts' : 'combined') as TxnPlan['mode'], positions, portfolios, merged: merged || [], priv, lastPfUpload };
}

// ---------- asset names → codes ----------

async function buildResolver(base: Awaited<ReturnType<typeof loadBase>>, manual: Record<string, string>) {
  const saved = (await getCache<Record<string, AssetRef>>(ASSET_MAP_KEY)) || {};
  const screener = (await getPortfolioData()) || [];
  const byCode = new Map<string, AssetRef>();
  const byName = new Map<string, AssetRef>();
  const add = (name: string, nse: string | null, bse: string | null) => {
    const ref: AssetRef = { code: nse || bse || '', nseCode: nse || null, bseCode: bse || null, name };
    if (!ref.code) return;
    if (nse) byCode.set(String(nse).toUpperCase(), ref);
    if (bse) byCode.set(String(bse).toUpperCase(), ref);
    const n = normName(name);
    if (n && !byName.has(n)) byName.set(n, ref);
  };
  for (const s of screener) add(s.name || s.stock || s.nseCode || s.bseCode, s.nseCode, s.bseCode);
  for (const p of base.positions.values()) add(p.name, p.nseCode, p.bseCode); // holdings win
  for (const h of base.merged) add(h.scripName, h.nseCode, h.bseCode);

  const manualRefs: Record<string, AssetRef> = {};
  for (const [asset, codeRaw] of Object.entries(manual)) {
    const code = String(codeRaw || '').trim().toUpperCase();
    if (!code) continue;
    const known = byCode.get(code);
    manualRefs[asset.trim().toUpperCase()] = known ?? {
      code, nseCode: /^\d+$/.test(code) ? null : code, bseCode: /^\d+$/.test(code) ? code : null, name: asset.trim(),
    };
  }

  return {
    resolve(asset: string): AssetRef | null {
      const a = asset.trim().toUpperCase();
      return manualRefs[a] ?? saved[a] ?? byCode.get(a) ?? byName.get(normName(asset)) ?? null;
    },
    manualRefs,
    saved,
  };
}

// ---------- planning ----------

interface Work {
  plan: TxnPlan;
  base: Awaited<ReturnType<typeof loadBase>>;
  positions: Map<string, Pos>;
  applied: { t: TxnInput; fp: string; ref: AssetRef; outcome: 'applied' | 'in_holdings' }[];
  entryHints: DatePriceHints;
  exitHints: DatePriceHints;
  manualRefs: Record<string, AssetRef>;
  saved: Record<string, AssetRef>;
}

async function work(txns: TxnInput[], manual: Record<string, string>): Promise<Work> {
  await ensureTable();
  const base = await loadBase();
  const { resolve, manualRefs, saved } = await buildResolver(base, manual);

  const fps = fingerprints(txns);
  // Day (IST) of the last full PF upload.
  const pfDay = base.lastPfUpload ? new Date(new Date(base.lastPfUpload).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10) : null;
  const done = new Set(
    fps.length
      ? (await query<any>(`SELECT fingerprint FROM pf_transactions WHERE fingerprint = ANY($1::text[])`, [fps])).map(r => r.fingerprint)
      : []
  );

  // Oldest first; rows on the same day keep file order.
  const order = txns.map((t, i) => ({ t, i, fp: fps[i] })).sort((a, b) => a.t.date.localeCompare(b.t.date) || a.i - b.i);

  const positions = new Map<string, Pos>();
  for (const [k, p] of base.positions) positions.set(k, { ...p });
  const before = new Map<string, Pos>();
  const changes = new Map<string, TxnChange>();
  const ignored = new Map<string, number>(), unknownTypes = new Map<string, number>();
  const unresolved = new Set<string>(), unknownPortfolios = new Set<string>();
  const applied: Work['applied'] = [];
  const entryHints: DatePriceHints = {}, exitHints: DatePriceHints = {};
  const sellsByCode = new Map<string, { qty: number; value: number; last: string }>();
  let duplicates = 0, inHoldings = 0, toApply = 0;
  const seen = new Set<string>();

  // Pass 1: classify, drop duplicates, resolve assets, group by account + stock.
  type Item = { t: TxnInput; fp: string; ref: AssetRef; kind: 'buy' | 'sell' | 'bonus'; delta: number; key: string; portfolio: string; skip: boolean };
  const items: Item[] = [];
  for (const { t, fp } of order) {
    const type = normType(t.type);
    const kind = BUY.has(type) ? 'buy' : SELL.has(type) ? 'sell' : BONUS.has(type) ? 'bonus' : IGNORE.has(type) || !(t.quantity > 0) ? 'ignore' : 'unknown';
    if (kind === 'ignore') { ignored.set(type, (ignored.get(type) ?? 0) + 1); continue; }
    if (kind === 'unknown') { unknownTypes.set(type, (unknownTypes.get(type) ?? 0) + 1); continue; }
    if (done.has(fp) || seen.has(fp)) { duplicates++; continue; }
    seen.add(fp);
    const ref = resolve(t.asset);
    if (!ref) { unresolved.add(t.asset.trim()); continue; }
    let portfolio = '';
    if (base.mode === 'accounts') {
      portfolio = base.portfolios.get(t.portfolio.trim().toLowerCase()) ?? t.portfolio.trim();
      if (!base.portfolios.has(t.portfolio.trim().toLowerCase())) unknownPortfolios.add(t.portfolio.trim() || '(none)');
    }
    items.push({ t, fp, ref, kind, delta: kind === 'sell' ? -t.quantity : t.quantity, key: keyOf(portfolio, ref.code), portfolio, skip: false });
  }

  // Pass 2: which rows the last full PF upload already contains.
  // Per account with running balances: find where the account's quantity sits
  // in the stock's sequence of balances; every row up to there is already in.
  // Otherwise (combined holdings, or no balances): rows dated before that upload.
  const groups = new Map<string, Item[]>();
  for (const it of items) groups.set(it.key, [...(groups.get(it.key) ?? []), it]);
  const useBal = new Set<string>();
  for (const [key, rows] of groups) {
    if (base.mode === 'accounts' && rows.every(r => r.t.balQty != null)) {
      useBal.add(key);
      const held = base.positions.get(key)?.qty ?? 0;
      const balAfter = (k: number) => (k === 0 ? rows[0].t.balQty! - rows[0].delta : rows[k - 1].t.balQty!);
      const matches: number[] = [];
      for (let k = 0; k <= rows.length; k++) if (Math.abs(balAfter(k) - held) < 1e-6) matches.push(k);
      // Prefer the latest point on or before the upload day; else the earliest match.
      const onOrBefore = matches.filter(k => k === 0 || !pfDay || rows[k - 1].t.date <= pfDay);
      const k = onOrBefore.length ? Math.max(...onOrBefore) : matches.length ? Math.min(...matches) : 0;
      for (let i = 0; i < k; i++) rows[i].skip = true;
    } else if (pfDay) {
      for (const r of rows) if (r.t.date < pfDay) r.skip = true;
    }
  }

  // Pass 3: apply in date order.
  for (const it of items) {
    const { t, fp, ref, kind, key: k, portfolio } = it;
    let pos = positions.get(k);
    if (!pos) {
      pos = { name: ref.name, nseCode: ref.nseCode, bseCode: ref.bseCode, qty: 0, cost: 0, avg: null };
      positions.set(k, pos);
    }
    if (!before.has(k)) before.set(k, { ...pos });
    let ch = changes.get(k);
    if (!ch) {
      ch = {
        portfolio, code: ref.code, name: pos.name || ref.name, qtyBefore: pos.qty, avgBefore: pos.avg, qtyAfter: pos.qty, avgAfter: pos.avg,
        buys: 0, sells: 0, skippedInHoldings: 0, isNew: pos.qty <= 0, isExit: false, balMismatch: null,
      };
      changes.set(k, ch);
    }
    if (it.skip) {
      ch.skippedInHoldings++;
      inHoldings++;
      applied.push({ t, fp, ref, outcome: 'in_holdings' });
      continue;
    }

    if (kind === 'sell') {
      const q = Math.min(t.quantity, Math.max(pos.qty, 0));
      if (pos.qty > 0) pos.cost -= (pos.cost / pos.qty) * q;
      pos.qty -= t.quantity;
      ch.sells++;
      const s = sellsByCode.get(ref.code) ?? { qty: 0, value: 0, last: t.date };
      s.qty += t.quantity; s.value += t.quantity * t.price; s.last = t.date;
      sellsByCode.set(ref.code, s);
    } else {
      const cost = kind === 'bonus' ? 0 : (t.amount != null && t.amount > 0 ? t.amount : t.quantity * t.price + (t.brokerage || 0));
      if (pos.qty <= 0) { pos.qty = 0; pos.cost = 0; }
      pos.qty += t.quantity;
      pos.cost += cost;
      ch.buys++;
      if (kind === 'buy' && !entryHints[ref.code]) entryHints[ref.code] = { date: t.date, price: t.price || null };
    }
    // The report's running balance (per account) wins over our arithmetic.
    if (useBal.has(k) && Math.abs(pos.qty - t.balQty!) > 1e-6) {
      if (!ch.balMismatch) ch.balMismatch = { expected: t.balQty!, had: pos.qty, date: t.date };
      // Keep the average; with none known, this row's price is the best estimate.
      const avg = pos.qty > 0 ? pos.cost / pos.qty : (pos.avg ?? (t.price || 0));
      pos.qty = t.balQty!;
      pos.cost = avg * pos.qty;
    }
    if (pos.qty <= 1e-9) { pos.qty = 0; pos.cost = 0; }
    pos.avg = pos.qty > 0 ? pos.cost / pos.qty : pos.avg;
    toApply++;
    applied.push({ t, fp, ref, outcome: 'applied' });
  }

  for (const [k, ch] of changes) {
    const p = positions.get(k)!;
    ch.qtyAfter = p.qty;
    ch.avgAfter = p.qty > 0 ? p.avg : null;
    ch.isExit = ch.qtyBefore > 0 && p.qty <= 0;
    ch.isNew = ch.qtyBefore <= 0 && p.qty > 0;
  }
  // Exit hints: average sell price and the last sell date per stock.
  for (const [code, s] of sellsByCode) exitHints[code] = { date: s.last, price: s.qty > 0 ? s.value / s.qty : null };

  const plan: TxnPlan = {
    mode: base.mode,
    total: txns.length,
    toApply,
    duplicates,
    inHoldings,
    ignored: [...ignored].map(([type, count]) => ({ type, count })),
    unknownTypes: [...unknownTypes].map(([type, count]) => ({ type, count })),
    unresolved: [...unresolved].sort(),
    unknownPortfolios: [...unknownPortfolios].sort(),
    changes: [...changes.values()]
      .filter(c => c.buys || c.sells || c.balMismatch || c.skippedInHoldings)
      .sort((a, b) => a.name.localeCompare(b.name) || a.portfolio.localeCompare(b.portfolio)),
    lastPfUpload: base.lastPfUpload,
  };
  return { plan, base, positions, applied, entryHints, exitHints, manualRefs, saved };
}

export async function previewTransactions(txns: TxnInput[], manual: Record<string, string>): Promise<TxnPlan> {
  return (await work(txns, manual)).plan;
}

export async function applyTransactions(txns: TxnInput[], manual: Record<string, string>, by: string):
  Promise<{ plan: TxnPlan; data: any[]; privateInvestments: { totalInvested: number; count: number } } & SnapshotResult> {
  const w = await work(txns, manual);
  if (w.plan.unresolved.length) throw new Error(`Map these assets to an NSE or BSE code first: ${w.plan.unresolved.join(', ')}`);

  // New holdings: per-account rows (accounts mode) and the merged rows.
  const accountRows: AccountRowInput[] | null = w.base.mode === 'accounts'
    ? [...w.positions.entries()].filter(([, p]) => p.qty > 0).map(([k, p]) => ({
      portfolio: (w.base.portfolios.get(k.split('|')[0]) ?? findPortfolio(w, k)),
      name: p.name, nseCode: p.nseCode, bseCode: p.bseCode, quantity: p.qty, averageBuyPrice: p.avg,
    }))
    : null;
  const merged = new Map<string, { scripName: string; nseCode: string | null; bseCode: string | null; quantity: number; cost: number }>();
  for (const p of w.positions.values()) {
    if (p.qty <= 0) continue;
    const code = codeOf(p);
    const m = merged.get(code);
    if (m) { m.quantity += p.qty; m.cost += p.qty * (p.avg ?? 0); }
    else merged.set(code, { scripName: p.name, nseCode: p.nseCode, bseCode: p.bseCode, quantity: p.qty, cost: p.qty * (p.avg ?? 0) });
  }
  // Same rule as a full upload: holdings of 1 share or less are left out.
  const data = [...merged.values()]
    .filter(m => m.quantity > 1)
    .map(({ cost, ...m }) => ({ ...m, averageBuyPrice: m.quantity ? cost / m.quantity : null }));

  const result = await saveHoldingsSnapshot({
    data,
    privateInvestments: w.base.priv,
    accountRows,
    by,
    entryHints: w.entryHints,
    exitHints: w.exitHints,
  });

  // Record what was applied (or found already in holdings) so it never applies twice.
  for (const { t, fp, ref, outcome } of w.applied) {
    await query(`
      INSERT INTO pf_transactions (fingerprint, portfolio, txn_date, txn_type, asset, stock_code, quantity, price, amount, bal_qty, outcome, applied_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (fingerprint) DO NOTHING
    `, [fp, t.portfolio.trim() || null, t.date, normType(t.type), t.asset.trim(), ref.code, t.quantity, t.price, t.amount, t.balQty, outcome, by]);
  }
  // Remember hand-mapped asset names.
  if (Object.keys(w.manualRefs).length) await setCache(ASSET_MAP_KEY, { ...w.saved, ...w.manualRefs });

  return { plan: w.plan, data, privateInvestments: w.base.priv, ...result };
}

/** Display name of a portfolio from a position key (new accounts aren't in the base map). */
function findPortfolio(w: Work, key: string): string {
  const lower = key.split('|')[0];
  const hit = w.applied.find(a => a.t.portfolio.trim().toLowerCase() === lower);
  return hit?.t.portfolio.trim() || lower;
}
