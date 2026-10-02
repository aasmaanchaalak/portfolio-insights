// Reads Nuvama's "Profit & Loss Report" (xlsx). Runs in the browser, so only
// the F&O figures leave the device — never the client's name, phone or email.
//
// Sheets used:
//   Summary            – one row per contract: open qty, avg, CMP, realised/unrealised, day P&L
//   Detail Realised    – trades closed in the period, with charges
//   Unrealised Details – trades behind the open positions, with charges

import { FoReport, ReportLeg, ReportTrade, LegType } from './types';

type Cell = string | number | boolean | Date | null;
export interface SheetRows { sheet: string; data: Cell[][] }

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** "01-Oct-2026", "30-Sep-26", "2026-10-27T05:30:00" or a Date → YYYY-MM-DD. */
function toIsoDate(v: Cell): string | null {
  if (v instanceof Date) return new Date(v.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function num(v: Cell): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: Cell): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}

/** Locates the header row (the one containing every `required` column) and maps names → indexes. */
function findTable(rows: Cell[][], required: string[]): { start: number; col: (name: string) => number } | null {
  for (let i = 0; i < rows.length; i++) {
    const names = rows[i].map(c => String(c ?? '').trim());
    if (required.every(r => names.includes(r))) {
      return { start: i + 1, col: (name: string) => names.indexOf(name) };
    }
  }
  return null;
}

function sheet(sheets: SheetRows[], name: string): Cell[][] | null {
  return sheets.find(s => s.sheet.trim().toLowerCase() === name.toLowerCase())?.data ?? null;
}

/** Throws with a readable message when the file isn't a single-day Nuvama P&L report. */
export function parseNuvamaPnlReport(sheets: SheetRows[]): FoReport {
  const summary = sheet(sheets, 'Summary');
  if (!summary) throw new Error('No "Summary" sheet. Is this Nuvama\'s Profit & Loss Report?');

  // Header block: "Name : UMA AGARWAL (60072941)" and "Period as on : 01-Oct-2026 to 01-Oct-2026".
  let clientCode: string | null = null;
  let from: string | null = null, to: string | null = null;
  for (const row of summary.slice(0, 30)) {
    const label = String(row.find(c => typeof c === 'string' && /:\s*$/.test(c)) ?? '').trim();
    const value = String(row.find((c, i) => i > row.indexOf(label) && c !== null && String(c).trim() !== '') ?? '');
    if (/^Name\s*:/i.test(label)) clientCode = value.match(/\((\w+)\)\s*$/)?.[1] ?? null;
    if (/^Period as on\s*:/i.test(label)) {
      const m = value.match(/(\S+)\s+to\s+(\S+)/i);
      if (m) { from = toIsoDate(m[1]); to = toIsoDate(m[2]); }
    }
  }
  if (!clientCode) throw new Error('Could not find the client code (the number after the name) in the report header.');
  if (!from || !to) throw new Error('Could not read the report\'s "Period as on" dates.');
  if (from !== to) {
    throw new Error(`The report covers ${from} to ${to}. Export it for a single day (same From and To date) so each day's P&L can be told apart.`);
  }

  const t = findTable(summary, ['Instrument', 'CloseQuantityAsOnLastDay', 'CMP', 'AssetType', 'UnderlyingAsset', 'ExpiryDate']);
  if (!t) throw new Error('The Summary sheet is missing its positions table.');
  const c = t.col;
  const legs: ReportLeg[] = [];
  for (const row of summary.slice(t.start)) {
    const contract = String(row[c('Instrument')] ?? '').trim();
    if (!contract || String(row[c('Isin')] ?? '').trim() === 'Total') continue;
    if (!/f&o|fno/i.test(String(row[c('AssetType')] ?? ''))) continue;
    const optType = String(row[c('OptionType')] ?? '').trim().toUpperCase();
    const instType = String(row[c('InstrumentType')] ?? '').trim().toLowerCase();
    const type: LegType | null = instType.startsWith('fut') ? 'FUT' : optType === 'CE' || optType === 'PE' ? optType : null;
    const expiry = toIsoDate(row[c('ExpiryDate')]);
    const underlying = String(row[c('UnderlyingAsset')] ?? '').trim().toUpperCase();
    if (!type || !expiry || !underlying) continue;
    const qty = num(row[c('CloseQuantityAsOnLastDay')]);
    // Long positions carry their average in BuyAvgOpenPrice, shorts in SellAvgPrice.
    const avg = qty >= 0 ? num(row[c('BuyAvgOpenPrice')]) : num(row[c('SellAvgPrice')]);
    legs.push({
      contract, underlying, type, expiry,
      strike: type === 'FUT' ? null : numOrNull(row[c('StrikePrice')]),
      qty, avg,
      ltp: num(row[c('CMP')]),
      unrealised: num(row[c('NetUnrealizedPnL')]),
      realised: num(row[c('NetRealizedPnL')]),
      dayPnl: numOrNull(row[c('DayGL')]),
    });
  }

  const trades: ReportTrade[] = [];
  for (const name of ['Detail Realised', 'Unrealised Details']) {
    const rows = sheet(sheets, name);
    if (!rows) continue;
    const tt = findTable(rows, ['Instrument', 'TxnDate', 'Action', 'Quantity', 'Price', 'NetCharges']);
    if (!tt) continue;
    for (const row of rows.slice(tt.start)) {
      const contract = String(row[tt.col('Instrument')] ?? '').trim();
      const date = toIsoDate(row[tt.col('TxnDate')]);
      const action = String(row[tt.col('Action')] ?? '').trim().toLowerCase();
      if (!contract || !date || (action !== 'buy' && action !== 'sell')) continue;
      if (!/f&o|fno/i.test(String(row[tt.col('AssetType')] ?? 'FnO'))) continue;
      trades.push({
        contract, date,
        side: action === 'buy' ? 'Buy' : 'Sell',
        qty: Math.abs(num(row[tt.col('Quantity')])),
        price: num(row[tt.col('Price')]),
        charges: num(row[tt.col('NetCharges')]),
      });
    }
  }

  if (legs.length === 0 && trades.length === 0) throw new Error('No F&O positions or trades found in this report.');
  return { broker: 'nuvama', account: `nuvama:${clientCode}`, asOf: to, legs, trades };
}
