// Financial ratios read from the Screener upload and shown on the Portfolio
// page (columns, range filters, footer, CSV export) and in the stock drawer.
// ROCE predates this list and is handled alongside it as `roce`.

export type RatioKind = 'pct' | 'multiple' | 'days';

export interface RatioDef {
  key: string;
  label: string;
  short?: string;
  group: 'Profitability & Valuation' | 'Operational' | 'Solvency';
  kind: RatioKind;
  digits: number;
  /** CSV header names accepted on upload (matched ignoring case, spaces and symbols). */
  aliases: string[];
}

export const RATIO_DEFS: RatioDef[] = [
  { key: 'evEbitda', label: 'EV/EBITDA', group: 'Profitability & Valuation', kind: 'multiple', digits: 1,
    aliases: ['EV / EBITDA', 'EVEBITDA', 'EV to EBITDA', 'Enterprise value to EBITDA'] },
  { key: 'priceToSales', label: 'P/S', group: 'Profitability & Valuation', kind: 'multiple', digits: 2,
    aliases: ['Price to Sales', 'P/S', 'Price to sales ratio'] },
  { key: 'evSales', label: 'EV/Sales', group: 'Profitability & Valuation', kind: 'multiple', digits: 2,
    aliases: ['EV / Sales', 'EV to Sales', 'Enterprise value to sales'] },
  { key: 'gpm', label: 'GPM %', group: 'Profitability & Valuation', kind: 'pct', digits: 1,
    aliases: ['GPM', 'GPM %', 'Gross profit margin', 'Gross margin'] },
  { key: 'opm', label: 'OPM %', group: 'Profitability & Valuation', kind: 'pct', digits: 1,
    aliases: ['OPM', 'OPM %', 'Operating profit margin', 'OPM last year'] },
  { key: 'npm', label: 'NPM %', group: 'Profitability & Valuation', kind: 'pct', digits: 1,
    aliases: ['NPM', 'NPM %', 'Net profit margin', 'NPM last year'] },
  { key: 'roe', label: 'ROE %', group: 'Profitability & Valuation', kind: 'pct', digits: 1,
    aliases: ['Return on equity', 'ROE', 'ROE %'] },
  { key: 'roa', label: 'ROA %', group: 'Profitability & Valuation', kind: 'pct', digits: 1,
    aliases: ['Return on assets', 'ROA', 'ROA %'] },
  { key: 'inventoryDays', label: 'Inventory days', short: 'Inv days', group: 'Operational', kind: 'days', digits: 0,
    aliases: ['Inventory Days', 'Inventory turnover days', 'Days inventory'] },
  { key: 'receivableDays', label: 'Receivable days', short: 'Recv days', group: 'Operational', kind: 'days', digits: 0,
    aliases: ['Receivable Days', 'Receivables days', 'Debtor days', 'Days receivable'] },
  { key: 'payableDays', label: 'Payable days', short: 'Pay days', group: 'Operational', kind: 'days', digits: 0,
    aliases: ['Payable Days', 'Days Payable', 'Creditor days', 'Days payable outstanding'] },
  { key: 'cashConversionCycle', label: 'Cash conversion cycle', short: 'CCC days', group: 'Operational', kind: 'days', digits: 0,
    aliases: ['Cash Conversion Cycle', 'CCC'] },
  { key: 'debtToEquity', label: 'Debt to equity', short: 'D/E', group: 'Solvency', kind: 'multiple', digits: 2,
    aliases: ['Debt to equity', 'D/E', 'Debt / Equity'] },
  { key: 'interestCoverage', label: 'Interest coverage', short: 'Int cover', group: 'Solvency', kind: 'multiple', digits: 1,
    aliases: ['Interest Coverage', 'Interest Coverage Ratio', 'ICR'] },
];

export const RATIO_KEYS = RATIO_DEFS.map(d => d.key);

/** Header normaliser for alias matching: "EV / EBITDA" → "evebitda". */
export const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** normalised CSV header → ratio key */
export const RATIO_ALIAS_MAP: Record<string, string> = Object.fromEntries(
  RATIO_DEFS.flatMap(d => [d.label, ...d.aliases].map(a => [normalizeHeader(a), d.key]))
);

/** Plain-text value for the drawer / exports. */
export function formatRatio(def: RatioDef, v: number | null | undefined): string {
  if (v == null || isNaN(v)) return 'N/A';
  if (def.kind === 'pct') return `${v.toFixed(def.digits)}%`;
  if (def.kind === 'days') return `${v.toFixed(def.digits)} days`;
  return `${v.toFixed(def.digits)}x`;
}
