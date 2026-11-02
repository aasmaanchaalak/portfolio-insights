// Reading and editing a forward-model grid (ValuationTableData) by row label and
// year, for the Claude connector. Same grid the Forward Metrics tab (public
// stocks) and the PE Valuation tab edit; cells are keyed "<rowId>:<colId>".

import { ValuationTableData, ValuationRow } from '../../types/pe';
import { fyLabel, parseFYLabel, deriveForwardTargetDetails } from '../fiscalYear';
import { uuid } from '../uuid';

// Defaults mirror the UI tabs so a grid started here looks the same as one
// started in the app (the Forward Metrics tab adds any missing locked rows).
const STOCK_DEFAULT_ROWS: Omit<ValuationRow, 'id'>[] = [
  { label: 'Revenue', order: 0 },
  { label: 'EBITDA', order: 1, metric: 'ebitda', locked: true },
  { label: 'PAT', order: 2 },
  { label: 'EPS', order: 3, metric: 'eps', locked: true },
  { label: 'P/E (target)', order: 4, metric: 'pe', locked: true },
  { label: 'EV/EBITDA (target)', order: 5, metric: 'evEbitda', locked: true },
  { label: 'Net debt (₹ Cr)', order: 6, metric: 'netDebt', locked: true },
  { label: 'Shares (Cr)', order: 7, metric: 'shares', locked: true },
];
const PE_DEFAULT_ROWS: Omit<ValuationRow, 'id'>[] = [
  { label: 'Valuation', order: 0 },
  { label: 'PAT', order: 1 },
  { label: 'Unit Sales', order: 2 },
  { label: 'AOV', order: 3 },
];

export function defaultGrid(kind: 'stock' | 'pe', currentFY: number): ValuationTableData {
  return {
    rows: (kind === 'stock' ? STOCK_DEFAULT_ROWS : PE_DEFAULT_ROWS).map(r => ({ ...r, id: uuid() })),
    columns: [-2, -1, 0, 1, 2].map((offset, i) => ({ id: uuid(), year: fyLabel(currentFY + offset, currentFY), order: i })),
    cells: {},
  };
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Exact label first (ignoring case/punctuation), then a unique prefix match so
// "P/E" finds "P/E (target)" and "Net debt" finds "Net debt (₹ Cr)".
function findRow(data: ValuationTableData, label: string): ValuationRow | undefined {
  const k = key(label);
  if (!k) return undefined;
  const exact = data.rows.find(r => key(r.label) === k);
  if (exact) return exact;
  const prefixed = data.rows.filter(r => key(r.label).startsWith(k));
  return prefixed.length === 1 ? prefixed[0] : undefined;
}

export interface ModelUpdate {
  row: string;
  year: string;
  value: number | null;
}

export interface ModelChange {
  row: string;
  year: string;
  from: number | null;
  to: number | null;
}

/**
 * Apply cell updates to a grid. Missing rows/years are added when
 * `createMissing` is set, otherwise they're reported as errors. Returns the new
 * grid; the input is not mutated.
 */
export function applyModelUpdates(
  input: ValuationTableData,
  updates: ModelUpdate[],
  currentFY: number,
  createMissing: boolean,
): { data: ValuationTableData; changes: ModelChange[]; errors: string[] } {
  const data: ValuationTableData = {
    rows: input.rows.map(r => ({ ...r })),
    columns: input.columns.map(c => ({ ...c })),
    cells: { ...input.cells },
  };
  const changes: ModelChange[] = [];
  const errors: string[] = [];

  for (const u of updates) {
    const label = String(u.row ?? '').trim();
    const fy = parseFYLabel(String(u.year ?? ''));
    if (!label) { errors.push('An update is missing its row label'); continue; }
    if (fy == null || fy < 1990 || fy > 2100) { errors.push(`"${u.year}" is not a fiscal year (use e.g. FY27 or FY27E)`); continue; }
    if (u.value !== null && (typeof u.value !== 'number' || !Number.isFinite(u.value))) {
      errors.push(`${label} ${u.year}: value must be a number or null`); continue;
    }

    let row = findRow(data, label);
    if (!row) {
      if (!createMissing) { errors.push(`No row "${label}" (rows: ${data.rows.map(r => r.label).join(', ')})`); continue; }
      row = { id: uuid(), label, order: data.rows.length };
      data.rows.push(row);
    }

    let col = data.columns.find(c => parseFYLabel(c.year) === fy);
    if (!col) {
      if (!createMissing) { errors.push(`No column for FY${fy % 100}`); continue; }
      col = { id: uuid(), year: fyLabel(fy, currentFY), order: data.columns.length };
      data.columns.push(col);
    }

    const cellKey = `${row.id}:${col.id}`;
    const from = typeof data.cells[cellKey] === 'number' ? data.cells[cellKey] : null;
    data.cells[cellKey] = u.value;
    if (from !== u.value) changes.push({ row: row.label, year: col.year, from, to: u.value });
  }

  // Keep year columns chronological; unparseable headers stay at the end.
  data.columns
    .sort((a, b) => (parseFYLabel(a.year) ?? Infinity) - (parseFYLabel(b.year) ?? Infinity) || a.order - b.order)
    .forEach((c, i) => { c.order = i; });

  return { data, changes, errors };
}

const fmt = (v: number | null | undefined) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)) : '';

/** The grid as a markdown table, plus derived target prices for stock models. */
export function formatModel(data: ValuationTableData | null, withTargets: boolean): string {
  if (!data || !data.rows?.length || !data.columns?.length) return '(no model saved yet)';
  const cols = [...data.columns].sort((a, b) => a.order - b.order);
  const rows = [...data.rows].sort((a, b) => a.order - b.order);
  const lines = [
    `| Row | ${cols.map(c => c.year).join(' | ')} |`,
    `|---|${cols.map(() => '---:').join('|')}|`,
    ...rows.map(r => `| ${r.label} | ${cols.map(c => fmt(data.cells?.[`${r.id}:${c.id}`])).join(' | ')} |`),
  ];

  if (withTargets) {
    const targets = deriveForwardTargetDetails(data);
    const years = Object.keys(targets).map(Number).sort((a, b) => a - b);
    if (years.length > 0) {
      lines.push('', 'Derived target price (₹/share): ' + years
        .map(fy => `FY${fy % 100} ${fmt(targets[fy].price)} (${targets[fy].method === 'pe' ? 'EPS × P/E' : 'EV/EBITDA'})`)
        .join(', '));
    }
  }
  return lines.join('\n');
}
