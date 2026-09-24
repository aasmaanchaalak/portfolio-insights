// ============================================================================
// Fiscal-year helpers (Indian convention: FY runs 1 Apr → 31 Mar).
//
// A fiscal year is identified by its ENDING calendar year:
//   FY2027  ==  1 Apr 2026 → 31 Mar 2027.
//
// The app's "current fiscal year" is admin-controlled (stored in app_settings)
// so the whole forward window shifts only when the team clicks "advance", not
// silently on 1 April. computeCurrentFY() is only the fallback default.
// ============================================================================

import type { ValuationTableData } from '../types/pe';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

// Date-derived current FY (ending year). April (month index 3) onward → next FY.
export function computeCurrentFY(date: Date = new Date()): number {
  const y = date.getFullYear();
  return date.getMonth() >= 3 ? y + 1 : y;
}

// Parse a free-form year header ("FY27E", "FY2027", "FY27", "2027", "FY26E")
// into its absolute ending year. Returns null when unparseable.
export function parseFYLabel(label: string | null | undefined): number | null {
  if (label == null) return null;
  const m = String(label).match(/(\d{2,4})/);
  if (!m) return null;
  let n = parseInt(m[1], 10);
  if (isNaN(n)) return null;
  if (n < 100) n += 2000; // "27" → 2027
  return n;
}

// Header label for a fiscal year relative to the current FY. Completed years
// (fy < currentFY) render without "E"; the current year and beyond are still
// estimates and carry the "E" suffix.
export function fyLabel(fy: number, currentFY: number): string {
  const short = (fy % 100).toString().padStart(2, '0');
  return `FY${short}${fy >= currentFY ? 'E' : ''}`;
}

// Last instant of a fiscal year (31 Mar of its ending year).
export function fyEndDate(fy: number): Date {
  return new Date(fy, 2, 31, 23, 59, 59); // month index 2 = March
}

// Fractional years from `from` until the FY ends. Negative if already over.
export function yearsUntilFYEnd(fy: number, from: Date = new Date()): number {
  return (fyEndDate(fy).getTime() - from.getTime()) / YEAR_MS;
}

// Forward IRR from today's price to a projected target price at a fiscal-year
// end (target from the stock's Forward Metrics — see deriveForwardTargetDetails).
// Annualized (CAGR) when the FY-end is a year or more out; a simple return when
// it's closer, since annualizing a few months extrapolates to noise.
export function computeForwardIRR(
  currentPrice: number | null | undefined,
  target: number | null | undefined,
  fy: number,
  now: Date = new Date(),
): number | null {
  if (currentPrice == null || currentPrice <= 0 || target == null || target <= 0) return null;
  const years = yearsUntilFYEnd(fy, now);
  const multiple = target / currentPrice;
  if (years <= 1) return (multiple - 1) * 100;
  return (Math.pow(multiple, 1 / years) - 1) * 100;
}

// The forward window of length n starting at the current FY: [cur, cur+1, ...].
export function forwardWindow(currentFY: number, n = 3): number[] {
  return Array.from({ length: n }, (_, i) => currentFY + i);
}

// Human label, e.g. "FY2027 (Apr 2026 – Mar 2027)".
export function fyDescription(fy: number): string {
  return `FY${fy} (Apr ${fy - 1} – Mar ${fy})`;
}

// ---------------------------------------------------------------------------
// Forward target-price derivation from a Forward Metrics grid.
//
// For each year column:
//   1. P/E method        target = EPS × target P/E            (when both are set)
//   2. EV/EBITDA method  target = (EBITDA × target EV/EBITDA − net debt) ÷ shares
//                        used when P/E is blank. EBITDA and net debt are in ₹ Cr,
//                        shares in crore, so the result is ₹ per share. A blank
//                        net debt or shares cell borrows the nearest year that has
//                        one (earlier years first); net debt defaults to 0.
//
// Rows are found by their `metric` tag first (locked rows), then by label as a
// fallback for older grids saved before the rows were tagged.
// ---------------------------------------------------------------------------

export type ForwardMethod = 'pe' | 'evEbitda';

export interface ForwardTarget {
  price: number;
  method: ForwardMethod;
}

type Metric = NonNullable<ValuationTableData['rows'][number]['metric']>;

const METRIC_LABELS: Record<Metric, RegExp> = {
  eps: /^\s*eps\s*$/i,
  pe: /p\s*\/?\s*e/i,
  ebitda: /^\s*ebitda\s*$/i,
  evEbitda: /ev\s*\/\s*ebitda/i,
  netDebt: /net\s*debt/i,
  shares: /shares/i,
};

export function findMetricRow(data: ValuationTableData, metric: Metric) {
  return data.rows.find(r => r.metric === metric)
    ?? data.rows.find(r => !r.metric && METRIC_LABELS[metric].test(r.label || ''));
}

export function deriveForwardTargetDetails(
  data: ValuationTableData | null | undefined,
): Record<number, ForwardTarget> {
  const out: Record<number, ForwardTarget> = {};
  if (!data || !Array.isArray(data.rows) || !Array.isArray(data.columns)) return out;

  const cells = data.cells || {};
  const cols = data.columns
    .map(c => ({ id: c.id, fy: parseFYLabel(c.year) }))
    .filter((c): c is { id: string; fy: number } => c.fy != null)
    .sort((a, b) => a.fy - b.fy);

  const row = (m: Metric) => findMetricRow(data, m);
  const epsRow = row('eps'), peRow = row('pe'), ebitdaRow = row('ebitda'),
    evRow = row('evEbitda'), netDebtRow = row('netDebt'), sharesRow = row('shares');

  const val = (rowId: string | undefined, colId: string): number | null => {
    if (!rowId) return null;
    const v = cells[`${rowId}:${colId}`];
    return typeof v === 'number' && isFinite(v) ? v : null;
  };
  // This year's value, else the nearest year's: earlier years first, then later.
  const nearest = (rowId: string | undefined, idx: number): number | null => {
    const own = val(rowId, cols[idx].id);
    if (own != null) return own;
    for (let j = idx - 1; j >= 0; j--) { const v = val(rowId, cols[j].id); if (v != null) return v; }
    for (let j = idx + 1; j < cols.length; j++) { const v = val(rowId, cols[j].id); if (v != null) return v; }
    return null;
  };

  cols.forEach((col, idx) => {
    const eps = val(epsRow?.id, col.id);
    const pe = val(peRow?.id, col.id);
    if (eps != null && pe != null && eps !== 0 && pe !== 0) {
      const price = eps * pe;
      if (price > 0) out[col.fy] = { price, method: 'pe' };
      return;
    }
    const ebitda = val(ebitdaRow?.id, col.id);
    const multiple = val(evRow?.id, col.id);
    const shares = nearest(sharesRow?.id, idx);
    if (ebitda == null || multiple == null || multiple <= 0 || shares == null || shares <= 0) return;
    const netDebt = nearest(netDebtRow?.id, idx) ?? 0;
    const price = (ebitda * multiple - netDebt) / shares;
    if (price > 0) out[col.fy] = { price, method: 'evEbitda' };
  });
  return out;
}

/** Target price per absolute FY — see deriveForwardTargetDetails for the methods. */
export function deriveForwardTargets(
  data: ValuationTableData | null | undefined,
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [fy, t] of Object.entries(deriveForwardTargetDetails(data))) out[Number(fy)] = t.price;
  return out;
}
