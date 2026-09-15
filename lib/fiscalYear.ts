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
// target price for a year = projected EPS × target (exit) P/E for that year.
// EPS / P/E rows are found by their `metric` tag first (locked rows), then by
// label as a fallback for older grids saved before the rows were tagged.
// ---------------------------------------------------------------------------
export function deriveForwardTargets(
  data: ValuationTableData | null | undefined,
): Record<number, number> {
  const out: Record<number, number> = {};
  if (!data || !Array.isArray(data.rows) || !Array.isArray(data.columns)) return out;

  const epsRow =
    data.rows.find(r => (r as any).metric === 'eps') ??
    data.rows.find(r => /^\s*eps\s*$/i.test(r.label || ''));
  const peRow =
    data.rows.find(r => (r as any).metric === 'pe') ??
    data.rows.find(r => /p\s*\/?\s*e/i.test(r.label || ''));
  if (!epsRow || !peRow) return out;

  const cells = data.cells || {};
  for (const col of data.columns) {
    const fy = parseFYLabel(col.year);
    if (fy == null) continue;
    const eps = cells[`${epsRow.id}:${col.id}`];
    const pe = cells[`${peRow.id}:${col.id}`];
    if (typeof eps === 'number' && typeof pe === 'number' && eps !== 0 && pe !== 0) {
      out[fy] = eps * pe;
    }
  }
  return out;
}
