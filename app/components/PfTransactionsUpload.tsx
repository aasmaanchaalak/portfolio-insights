'use client';

// PF Data → Upload transactions: apply buys and sells to the last holdings
// instead of uploading a complete PF export. Reads GridKey's transaction
// report (.xlsx, one file per portfolio) or a plain CSV, shows what will
// change, then applies it (lib/pfTransactions.ts). Files are parsed in the
// browser; only the transaction rows are sent.

import React, { useEffect, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';

type Cell = string | number | boolean | Date | null;

export interface TxnRow {
  portfolio: string; date: string; type: string; asset: string;
  quantity: number; price: number; brokerage: number; amount: number | null; balQty: number | null;
}
interface ParsedFile { fileName: string; detected: string; portfolio: string; rows: TxnRow[]; hasPortfolioColumn: boolean }

interface TxnChange {
  portfolio: string; code: string; name: string;
  qtyBefore: number; avgBefore: number | null; qtyAfter: number; avgAfter: number | null;
  buys: number; sells: number; skippedInHoldings: number; isNew: boolean; isExit: boolean;
  balMismatch: { expected: number; had: number; date: string } | null;
}
interface TxnPlan {
  mode: 'accounts' | 'combined'; total: number; toApply: number; duplicates: number; inHoldings: number;
  ignored: { type: string; count: number }[]; unknownTypes: { type: string; count: number }[];
  unresolved: string[]; unknownPortfolios: string[]; changes: TxnChange[]; lastPfUpload: string | null;
}
export interface TxnApplyResult {
  data: any[];
  privateInvestments: { totalInvested: number; count: number };
  newStocks: { code: string; name: string }[];
  exitedStocks: { ticker: string; companyName: string }[];
  plan: TxnPlan;
}

export const TXN_TEMPLATE_HEADERS = ['Date', 'Transaction Type', 'Asset Name', 'Quantity', 'Price', 'Brokerage', 'Amount', 'Bal Qty', 'Portfolio'];
export const TXN_TEMPLATE_EXAMPLE = ['10-12-2024', 'BUY', 'RELIANCE', '10', '1250.50', '0', '12505', '110', 'Main Portfolio'];

// ---------- parsing ----------

const norm = (v: Cell) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const COLS: Record<keyof Omit<TxnRow, 'portfolio'> | 'portfolio', string[]> = {
  date: ['date', 'trade date', 'transaction date', 'txn date'],
  type: ['transaction type', 'type', 'buy/sell', 'side', 'action', 'txn type'],
  asset: ['asset name', 'asset', 'symbol', 'nse', 'scrip', 'scrip name', 'stock', 'instrument', 'security'],
  quantity: ['quantity', 'qty'],
  price: ['price', 'rate', 'trade price'],
  brokerage: ['brokerage'],
  amount: ['amount', 'net amount', 'value'],
  balQty: ['bal qty', 'balance qty', 'balance quantity', 'bal. qty'],
  portfolio: ['portfolio', 'portfolio name'],
};
const MON: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function toIsoDate(v: Cell): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Spreadsheet dates come through at UTC midnight.
    return v.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // DD-MM-YYYY (Indian reports)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{4})$/);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${MON[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  return null;
}
const toNum = (v: Cell): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,₹\s]/g, ''));
  return isFinite(n) ? n : null;
};

/** Rows of one sheet (or CSV) → transactions, plus the portfolio named in the report header. */
export function parseTxnRows(rows: Cell[][], fileName: string): ParsedFile {
  let detected = '';
  for (const r of rows.slice(0, 20)) {
    for (const c of r) {
      const m = String(c ?? '').match(/^\s*Portfolio Name(?:\s*\/\s*ID)?\s*:\s*(.+?)\s*$/i);
      if (m) detected = m[1].split(/\s+\/\s+/)[0].trim();
    }
  }
  if (!detected) {
    // GridKey file names: "<Portfolio>_<ID>_transaction_report_1.xlsx"
    const m = fileName.match(/^(.+?)_[^_]+_transaction_report/i);
    if (m) detected = m[1].trim();
  }

  const hi = rows.findIndex(r => {
    const cells = r.map(norm);
    return COLS.date.some(a => cells.includes(a)) && COLS.quantity.some(a => cells.includes(a)) && COLS.asset.some(a => cells.includes(a));
  });
  if (hi < 0) throw new Error(`${fileName}: no header row with Date, Asset Name and Quantity columns.`);
  const head = rows[hi].map(norm);
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, aliases]) => [k, head.findIndex(h => aliases.includes(h))])) as Record<keyof typeof COLS, number>;
  if (idx.type < 0) throw new Error(`${fileName}: no Transaction Type (Buy/Sell) column.`);

  const out: TxnRow[] = [];
  for (const r of rows.slice(hi + 1)) {
    const date = toIsoDate(r[idx.date]);
    const type = String(r[idx.type] ?? '').trim();
    const asset = String(r[idx.asset] ?? '').trim();
    const quantity = toNum(r[idx.quantity]);
    if (!date || !type || !asset || quantity == null) continue; // section headers, blanks, totals
    out.push({
      portfolio: idx.portfolio >= 0 ? String(r[idx.portfolio] ?? '').trim() : '',
      date, type, asset,
      quantity: Math.abs(quantity),
      price: toNum(r[idx.price]) ?? 0,
      brokerage: idx.brokerage >= 0 ? toNum(r[idx.brokerage]) ?? 0 : 0,
      amount: idx.amount >= 0 ? toNum(r[idx.amount]) : null,
      balQty: idx.balQty >= 0 ? toNum(r[idx.balQty]) : null,
    });
  }
  return { fileName, detected, portfolio: detected, rows: out, hasPortfolioColumn: idx.portfolio >= 0 };
}

function parseCsv(text: string): string[][] {
  return text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()).map(line => {
    const out: string[] = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

async function readFile(file: File): Promise<ParsedFile> {
  if (/\.csv$/i.test(file.name)) return parseTxnRows(parseCsv(await file.text()), file.name);
  const sheets = (await readXlsxFile(file)) as unknown as { sheet: string; data: Cell[][] }[];
  const first = Array.isArray(sheets) && (sheets[0] as any)?.data ? sheets[0].data : (sheets as unknown as Cell[][]);
  return parseTxnRows(first, file.name);
}

/** Best guess at the PF export's account name for a report's portfolio. */
function matchAccount(detected: string, accounts: string[]): string {
  if (!detected || !accounts.length) return detected;
  const d = detected.toLowerCase();
  return accounts.find(a => a.toLowerCase() === d)
    ?? accounts.find(a => a.toLowerCase().startsWith(d) || d.startsWith(a.toLowerCase()))
    ?? detected;
}

// ---------- formatting ----------

const fmtQty = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtPx = (v: number | null) => (v == null ? '—' : '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (iso: string) => new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// ---------- component ----------

export function PfTransactionsUpload({ onApplied }: { onApplied: (r: TxnApplyResult) => void | Promise<void> }) {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<TxnPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/accounts').then(r => (r.ok ? r.json() : null)).then(d => {
      if (d?.holdings) setAccounts([...new Set<string>(d.holdings.map((h: any) => h.portfolio))].sort());
    }).catch(() => {});
  }, []);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    setPlan(null); setStatus(''); setError('');
    try {
      const parsed = await Promise.all(list.map(readFile));
      setFiles(parsed.map(f => ({ ...f, portfolio: matchAccount(f.detected, accounts) })));
      const empty = parsed.filter(f => !f.rows.length).map(f => f.fileName);
      if (empty.length) setError(`No transactions found in ${empty.join(', ')}.`);
    } catch (err: any) {
      setFiles([]);
      setError(err?.message || 'Could not read the file.');
    }
  };

  const transactions = () => files.flatMap(f => f.rows.map(r => ({ ...r, portfolio: f.hasPortfolioColumn && r.portfolio ? r.portfolio : f.portfolio })));

  const call = async (action: 'preview' | 'apply') => {
    setBusy(true); setError(''); setStatus('');
    try {
      const res = await fetch('/api/pf-transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, transactions: transactions(), mappings }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Request failed');
      if (action === 'preview') {
        setPlan(d);
      } else {
        setPlan(null);
        setFiles([]);
        setStatus(`Applied ${d.plan.toApply} transactions across ${d.plan.changes.length} holdings. Holdings now have ${d.data.length} stocks.`);
        await onApplied(d);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const rowCount = files.reduce((s, f) => s + f.rows.length, 0);
  const span = (() => {
    const dates = files.flatMap(f => f.rows.map(r => r.date)).sort();
    return dates.length ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : '';
  })();

  return (
    <div className="upload-action-area">
      <div className="filter-group">
        <label htmlFor="txn-upload">Transaction report(s)</label>
        <input type="file" id="txn-upload" accept=".xlsx,.csv" multiple onChange={onFiles} />
      </div>

      {files.length > 0 && (
        <div className="txn-files">
          {files.map((f, i) => (
            <div key={f.fileName} className="txn-file">
              <div className="txn-file-name">{f.fileName}</div>
              <div className="txn-file-meta">{f.rows.length} rows</div>
              {f.hasPortfolioColumn ? (
                <div className="txn-file-meta">Portfolio from the file's Portfolio column</div>
              ) : (
                <label className="txn-file-portfolio">
                  Account
                  {accounts.length ? (
                    <select value={f.portfolio} onChange={e => { const v = e.target.value; setPlan(null); setFiles(fs => fs.map((x, j) => (j === i ? { ...x, portfolio: v } : x))); }}>
                      {!accounts.includes(f.portfolio) && <option value={f.portfolio}>{f.portfolio || '— pick —'} (not in last PF upload)</option>}
                      {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  ) : (
                    <span className="txn-file-meta">{f.detected || '—'}</span>
                  )}
                </label>
              )}
            </div>
          ))}
          <div className="txn-file-meta">{rowCount} rows · {span}</div>
        </div>
      )}

      <button className="process-btn" onClick={() => call('preview')} disabled={!rowCount || busy}>
        {busy && !plan ? 'Checking…' : plan ? 'Preview again' : 'Preview changes'}
      </button>

      {plan && (
        <div className="txn-plan">
          <div className="txn-summary">
            <b>{plan.toApply}</b> to apply · {plan.duplicates} applied in an earlier upload · {plan.inHoldings} already in the last PF upload
            {plan.lastPfUpload && ` (${fmtDate(plan.lastPfUpload)})`}
            {plan.ignored.length > 0 && ` · ignored: ${plan.ignored.map(x => `${x.count} ${x.type.toLowerCase()}`).join(', ')}`}
          </div>
          {plan.mode === 'combined' && (
            <div className="txn-warn">
              The last PF upload had no Portfolio column, so transactions apply to the combined holdings and rows dated before that upload are skipped.
            </div>
          )}
          {plan.unknownTypes.length > 0 && (
            <div className="txn-warn">Not applied (unknown type): {plan.unknownTypes.map(x => `${x.count} × ${x.type}`).join(', ')}. Adjust these by uploading a complete PF.</div>
          )}
          {plan.unknownPortfolios.length > 0 && (
            <div className="txn-warn">Not in the last PF upload, so treated as new accounts: {plan.unknownPortfolios.join(', ')}. Pick the right account above if it's a naming difference.</div>
          )}
          {plan.unresolved.length > 0 && (
            <div className="txn-unresolved">
              <div className="txn-warn">These names didn't match any holding or Screener stock. Enter the NSE symbol (or BSE code), then preview again:</div>
              {plan.unresolved.map(a => (
                <label key={a} className="txn-map-row">
                  <span>{a}</span>
                  <input value={mappings[a] || ''} placeholder="NSE symbol / BSE code"
                    onChange={e => setMappings(m => ({ ...m, [a]: e.target.value.toUpperCase() }))} />
                </label>
              ))}
            </div>
          )}

          {plan.changes.length > 0 && (
            <div className="txn-table-wrap">
              <table className="txn-table">
                <thead>
                  <tr>
                    <th>Stock</th>
                    {plan.mode === 'accounts' && <th>Account</th>}
                    <th className="r">Buys / sells</th>
                    <th className="r">Qty</th>
                    <th className="r">Avg buy</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.changes.map(c => (
                    <tr key={c.portfolio + c.code}>
                      <td><b>{c.name}</b> <span className="txn-code">{c.code}</span></td>
                      {plan.mode === 'accounts' && <td>{c.portfolio}</td>}
                      <td className="r">{c.buys} / {c.sells}</td>
                      <td className="r">{fmtQty(c.qtyBefore)} → <b>{fmtQty(c.qtyAfter)}</b></td>
                      <td className="r">{fmtPx(c.avgBefore)} → <b>{fmtPx(c.avgAfter)}</b></td>
                      <td className="txn-note">
                        {[
                          c.isNew && 'New',
                          c.isExit && 'Exited',
                          c.skippedInHoldings > 0 && `${c.skippedInHoldings} already in PF upload`,
                          c.balMismatch && `Report balance used (${fmtQty(c.balMismatch.expected)}; computed ${fmtQty(c.balMismatch.had)} on ${fmtDate(c.balMismatch.date)})`,
                        ].filter(Boolean).join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="process-btn" onClick={() => call('apply')} disabled={busy || plan.unresolved.length > 0 || plan.toApply === 0}>
            {busy ? 'Applying…' : plan.toApply === 0 ? 'Nothing new to apply' : `Apply ${plan.toApply} transactions`}
          </button>
        </div>
      )}

      {status && <div className="status-message success">{status}</div>}
      {error && <div className="status-message error">{error}</div>}
    </div>
  );
}
