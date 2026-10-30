// Portfolio alerts for push notifications:
// - a holding crossing below its 50 or 200 DMA
// - a holding at its upper or lower circuit
// - a holding falling STOP_LOSS_PCT below its average buy price (stop loss)
// - a user-set price alert reaching its target (see lib/priceAlerts.ts)
// Each event fires once: a DMA or stop-loss alert re-arms only after the price
// recovers above the line, a circuit alert fires at most once per stock per
// day, and a price alert is done once it fires.

import { query } from './db';
import { getCache, setCache, getGridKeyData, getPortfolioData, getAnalystOverrides, isVisibleToAnalyst } from './queries';
import { LiveQuote } from './livePrices';
import { getSubscribers, sendPush, PushMessage } from './push';
import { getActivePriceAlerts, markPriceAlertTriggered, priceAlertHit } from './priceAlerts';

// Stop loss: alert when the price is this many percent below the average buy price.
export const STOP_LOSS_PCT = 20;

// Re-arm a DMA alert only once the price is this far back above the DMA, so a
// stock hovering at the line doesn't alert every 10 minutes.
const REARM_ABOVE = 1.005;
// A circuit counts as hit within this many percentage points of the band
// (circuit prices are rounded to the tick size).
const CIRCUIT_TOLERANCE_PP = 0.1;
// Bands to try when the stock's own band is unknown (BSE-only scrips). 2% is
// left out: those are thinly traded scrips where Yahoo's delayed quote is often
// an old trade, so a ~2% move there is too often a false alarm.
const COMMON_BANDS = [5, 10, 20];

// ---------- NSE price bands ----------

const BANDS_KEY = 'nse-price-bands';

/** NSE symbol → band % (null = "No Band", i.e. F&O stocks with no fixed circuit). Refreshed twice a day. */
async function getNseBands(): Promise<Record<string, number | null> | null> {
  const cached = await getCache<Record<string, number | null>>(BANDS_KEY);
  if (cached) return cached;
  try {
    const res = await fetch('https://nsearchives.nseindia.com/content/equities/sec_list.csv', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bands: Record<string, number | null> = {};
    for (const line of (await res.text()).split(/\r?\n/).slice(1)) {
      const cols = parseCsvLine(line);
      if (cols.length < 4 || !cols[0]) continue;
      const sym = cols[0].toUpperCase();
      const band = parseFloat(cols[3]);
      if (!(sym in bands)) bands[sym] = Number.isFinite(band) ? band : null;
    }
    await setCache(BANDS_KEY, bands, 12 * 60 * 60);
    return bands;
  } catch (e: any) {
    console.warn(`[alerts] NSE price bands unavailable: ${e?.message}`);
    return null;
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** 'UC' / 'LC' when the price sits at the circuit limit, else null. */
export function circuitStatus(q: LiveQuote, band: number | null | undefined): 'UC' | 'LC' | null {
  if (q.changePct == null || band === null) return null; // "No Band": no fixed circuit
  const move = q.changePct;
  const atHigh = q.dayHigh == null || q.price >= q.dayHigh - 0.001;
  const atLow = q.dayLow == null || q.price <= q.dayLow + 0.001;
  const bands = band !== undefined ? [band] : COMMON_BANDS;
  for (const b of bands) {
    // Unknown band: only an exact band-sized move counts, to avoid false alarms.
    const hit = band !== undefined ? (x: number) => x >= b - CIRCUIT_TOLERANCE_PP : (x: number) => Math.abs(x - b) <= CIRCUIT_TOLERANCE_PP;
    if (hit(move) && atHigh) return 'UC';
    if (hit(-move) && atLow) return 'LC';
  }
  return null;
}

/**
 * Stop-loss state step. Unlike the DMA alerts, a holding already past its stop
 * when first seen alerts once, so existing breaches aren't silently skipped.
 */
export function stopLossTransition(was: boolean | null, price: number, stop: number): { below: boolean; alert: boolean } {
  const below = price < stop;
  if (!was && below) return { below: true, alert: true };
  if (was && price > stop * REARM_ABOVE) return { below: false, alert: false };
  return { below: was ?? below, alert: false };
}

/**
 * DMA state step. `was` is the recorded below-DMA flag (null = never seen).
 * Alerts only on a fresh cross below; re-arms once back above by REARM_ABOVE.
 */
export function dmaTransition(was: boolean | null, price: number, dma: number): { below: boolean; alert: boolean } {
  const below = price < dma;
  if (was === null) return { below, alert: false };          // first sighting: record, don't alert
  if (!was && below) return { below: true, alert: true };
  if (was && price > dma * REARM_ABOVE) return { below: false, alert: false };
  return { below: was, alert: false };
}

// ---------- alert state ----------

let stateTableReady = false;
async function ensureStateTable(): Promise<void> {
  if (stateTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS stock_alert_state (
      stock_code    VARCHAR(30) PRIMARY KEY,
      below_50dma   BOOLEAN,
      below_200dma  BOOLEAN,
      circuit       VARCHAR(2),
      circuit_date  DATE,
      updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE stock_alert_state ADD COLUMN IF NOT EXISTS below_stop_loss BOOLEAN`);
  stateTableReady = true;
}

interface AlertState {
  below50: boolean | null;
  below200: boolean | null;
  belowStop: boolean | null;
  circuit: string | null;
  circuitDate: string | null;
}

function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------- evaluation ----------

export interface StockAlert {
  code: string;         // holding's NSE or BSE code
  name: string;
  kind: 'below50' | 'below200' | 'UC' | 'LC' | 'stopLoss' | `price${number}`;
  title: string;
  body: string;
  investedAmount: number; // for analyst visibility
}

const fmtRs = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

/**
 * Compares live quotes against DMAs and circuit bands for every holding,
 * returns new events, and (unless dryRun) records the new state.
 */
export async function evaluateAlerts(prices: Record<string, LiveQuote>, dryRun = false): Promise<StockAlert[]> {
  await ensureStateTable();
  const [holdings, screener, bands, stateRows, priceAlerts] = await Promise.all([
    getGridKeyData(),
    getPortfolioData(),
    getNseBands(),
    query<any>(`SELECT stock_code, below_50dma, below_200dma, below_stop_loss, circuit, to_char(circuit_date, 'YYYY-MM-DD') circuit_date FROM stock_alert_state`),
    getActivePriceAlerts(),
  ]);
  const states = new Map<string, AlertState>(stateRows.map(r => [r.stock_code, {
    below50: r.below_50dma, below200: r.below_200dma, belowStop: r.below_stop_loss, circuit: r.circuit, circuitDate: r.circuit_date,
  }]));
  const priceAlertsByCode = new Map<string, typeof priceAlerts>();
  for (const a of priceAlerts) {
    const k = a.stockCode.toLowerCase();
    priceAlertsByCode.set(k, [...(priceAlertsByCode.get(k) || []), a]);
  }
  const triggered: [number, number][] = [];
  const screenerByCode = new Map<string, any>();
  for (const s of screener || []) {
    if (s.nseCode) screenerByCode.set(String(s.nseCode).toLowerCase(), s);
    if (s.bseCode) screenerByCode.set(String(s.bseCode).toLowerCase(), s);
  }

  const today = istToday();
  const alerts: StockAlert[] = [];
  const updates: [string, boolean | null, boolean | null, boolean | null, string | null, string | null][] = [];
  // The upload can list a stock once per portfolio; evaluate each stock once.
  const seen = new Set<string>();

  for (const h of holdings || []) {
    if (!(Number(h.quantity) > 0)) continue;
    const code = String(h.nseCode || h.bseCode || '');
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const key = code.toLowerCase();
    const q = prices[key] ?? (h.bseCode ? prices[String(h.bseCode).toLowerCase()] : undefined);
    if (!q) continue;
    const s = screenerByCode.get(key) ?? (h.bseCode ? screenerByCode.get(String(h.bseCode).toLowerCase()) : undefined);
    const name = h.nseCode || s?.name || h.scripName || code;
    const invested = (Number(h.quantity) || 0) * (Number(h.averageBuyPrice) || 0);
    const prev = states.get(code);
    const next: AlertState = { below50: prev?.below50 ?? null, below200: prev?.below200 ?? null, belowStop: prev?.belowStop ?? null, circuit: prev?.circuit ?? null, circuitDate: prev?.circuitDate ?? null };

    for (const [period, field] of [[50, 'below50'], [200, 'below200']] as const) {
      const dma = Number(s?.[`dma${period}`]);
      if (!(dma > 0)) continue;
      const step = dmaTransition(next[field], q.price, dma);
      next[field] = step.below;
      if (step.alert) {
        const gap = ((q.price - dma) / dma) * 100;
        alerts.push({
          code, name, kind: field, investedAmount: invested,
          title: `${name} fell below ${period} DMA`,
          body: `${fmtRs(q.price)} vs ${period} DMA ${fmtRs(dma)} (${fmtPct(gap)})${q.changePct != null ? ` · today ${fmtPct(q.changePct)}` : ''}`,
        });
      }
    }

    const avgBuy = Number(h.averageBuyPrice);
    if (avgBuy > 0) {
      const stop = avgBuy * (1 - STOP_LOSS_PCT / 100);
      const step = stopLossTransition(next.belowStop, q.price, stop);
      next.belowStop = step.below;
      if (step.alert) {
        alerts.push({
          code, name, kind: 'stopLoss', investedAmount: invested,
          title: `${name} hit stop loss`,
          body: `${fmtRs(q.price)} is ${fmtPct(((q.price - avgBuy) / avgBuy) * 100)} vs avg buy ${fmtRs(avgBuy)} (stop ${fmtRs(stop)})`,
        });
      }
    }

    for (const a of priceAlertsByCode.get(key) || []) {
      if (!priceAlertHit(a, q.price)) continue;
      triggered.push([a.id, q.price]);
      alerts.push({
        code, name, kind: `price${a.id}`, investedAmount: invested,
        title: `${name} ${a.direction === 'above' ? 'rose to' : 'fell to'} ${fmtRs(a.targetPrice)}`,
        body: `Now ${fmtRs(q.price)}${q.changePct != null ? ` · today ${fmtPct(q.changePct)}` : ''}${a.note ? ` · ${a.note}` : ''}`,
      });
    }

    const band = h.nseCode ? (bands ? bands[String(h.nseCode).toUpperCase()] : undefined) : undefined;
    const circuit = circuitStatus(q, band);
    if (circuit && !(next.circuit === circuit && next.circuitDate === today)) {
      next.circuit = circuit;
      next.circuitDate = today;
      alerts.push({
        code, name, kind: circuit, investedAmount: invested,
        title: `${name} hit ${circuit === 'UC' ? 'upper' : 'lower'} circuit`,
        body: `${fmtRs(q.price)} (${fmtPct(q.changePct ?? 0)})${band ? ` · ${band}% band` : ''}`,
      });
    }

    if (!prev || prev.below50 !== next.below50 || prev.below200 !== next.below200 || prev.belowStop !== next.belowStop || prev.circuit !== next.circuit || prev.circuitDate !== next.circuitDate) {
      updates.push([code, next.below50, next.below200, next.belowStop, next.circuit, next.circuitDate]);
    }
  }

  if (!dryRun) {
    for (const u of updates) {
      await query(`
        INSERT INTO stock_alert_state (stock_code, below_50dma, below_200dma, below_stop_loss, circuit, circuit_date, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (stock_code) DO UPDATE SET below_50dma = $2, below_200dma = $3, below_stop_loss = $4, circuit = $5, circuit_date = $6, updated_at = NOW()
      `, u);
    }
    for (const [id, price] of triggered) await markPriceAlertTriggered(id, price);
  }
  return alerts;
}

/** One notification per device: the event itself, or a summary when several fire together. */
function toMessage(alerts: StockAlert[]): PushMessage {
  if (alerts.length === 1) return { title: alerts[0].title, body: alerts[0].body, tag: `alert-${alerts[0].code}-${alerts[0].kind}`, url: '/' };
  return {
    title: `${alerts.length} portfolio alerts`,
    body: alerts.map(a => a.title).join('\n'),
    tag: `alerts-${Date.now()}`,
    url: '/',
  };
}

/** Pushes the events to every subscribed device; analysts only see holdings visible to them. */
export async function notifyAlerts(alerts: StockAlert[]): Promise<{ devices: number; sent: number }> {
  if (alerts.length === 0) return { devices: 0, sent: 0 };
  const subs = await getSubscribers();
  const overrides = subs.some(s => s.role === 'analyst') ? await getAnalystOverrides() : {};
  let sent = 0;
  for (const sub of subs) {
    const mine = sub.role === 'analyst'
      ? alerts.filter(a => isVisibleToAnalyst(a.investedAmount, a.code, overrides))
      : alerts;
    if (mine.length && await sendPush(sub, toMessage(mine))) sent++;
  }
  return { devices: subs.length, sent };
}
