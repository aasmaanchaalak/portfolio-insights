'use client';

// F&O Data: the daily Nuvama P&L report, and margin and cash typed in from
// Nuvama. The account's holdings come from the GridKey upload.

import React, { useCallback, useEffect, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import { parseNuvamaPnlReport, SheetRows } from '../../../lib/fo/nuvama';
import { FoReport } from '../../../lib/fo/types';
import { rsAbs, rsSigned, shortDate } from './format';

const signedRs = (v: number) => (v < 0 ? '\u2212' : '') + rsAbs(v);
import './fo.css';

interface DataState {
  accounts: string[];
  reports: { account: string; asOf: string; legs: number; uploadedAt: string; uploadedBy: string | null }[];
  margins: Record<string, { cash: number | null; pledged: number | null; updatedAt: string; updatedBy: string | null }>;
  holdings: { portfolio: string; count: number; updatedAt: string | null };
}

const post = async (body: any) => {
  const res = await fetch('/api/fo/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
};

const accountLabel = (a: string) => a.replace(/^nuvama:/, 'Nuvama · ');
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function FODataPage() {
  const [state, setState] = useState<DataState | null>(null);
  const [account, setAccount] = useState<string>('');
  const load = useCallback(async () => {
    const res = await fetch('/api/fo/data');
    if (res.ok) {
      const s: DataState = await res.json();
      setState(s);
      setAccount(a => a || s.accounts[0] || '');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ---- report ----
  const [preview, setPreview] = useState<FoReport | null>(null);
  const [reportMsg, setReportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const onReportFile = async (file: File | undefined) => {
    setPreview(null); setReportMsg(null);
    if (!file) return;
    try {
      const sheets = (await readXlsxFile(file)) as unknown as SheetRows[];
      setPreview(parseNuvamaPnlReport(sheets));
    } catch (e: any) {
      setReportMsg({ ok: false, text: e.message || 'Could not read the file.' });
    }
  };
  const saveReport = async () => {
    if (!preview) return;
    try {
      await post({ kind: 'report', report: preview });
      setReportMsg({ ok: true, text: `Saved the report for ${shortDate(preview.asOf)}.` });
      setAccount(preview.account);
      setPreview(null);
      load();
    } catch (e: any) { setReportMsg({ ok: false, text: e.message }); }
  };

  // ---- margin ----
  const m = state?.margins[account];
  const [form, setForm] = useState({ cash: '', pledged: '' });
  useEffect(() => {
    const str = (v: number | null | undefined) => (v != null ? String(v) : '');
    setForm({ cash: str(m?.cash), pledged: str(m?.pledged) });
  }, [m?.cash, m?.pledged, account]); // eslint-disable-line react-hooks/exhaustive-deps
  const [marginMsg, setMarginMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const saveMargin = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')));
    const vals = { cash: n(form.cash), pledged: n(form.pledged) };
    if (Object.values(vals).some(v => v !== null && !Number.isFinite(v))) {
      setMarginMsg({ ok: false, text: 'Enter amounts in rupees, e.g. 4500000.' }); return;
    }
    if (vals.pledged !== null && vals.pledged < 0) {
      setMarginMsg({ ok: false, text: 'Only cash can be negative (a debit balance).' }); return;
    }
    try {
      await post({ kind: 'margin', account, ...vals });
      setMarginMsg({ ok: true, text: 'Saved.' });
      load();
    } catch (err: any) { setMarginMsg({ ok: false, text: err.message }); }
  };

  const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) =>
    m ? <div className={`fo-msg ${m.ok ? 'ok' : 'err'}`}>{m.text}</div> : null;
  const amountField = (key: keyof typeof form, label: string, hint?: string, signed = false) => (
    <label className="fo-field">
      <span>{label}</span>
      {/* iOS's decimal keypad has no minus key, so signed fields get the full keyboard. */}
      <input inputMode={signed ? 'text' : 'decimal'} value={form[key]} placeholder="₹" onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
      {hint && <small>{hint}</small>}
      {form[key] && Number.isFinite(Number(form[key].replace(/,/g, ''))) && <small className="n">{signedRs(Number(form[key].replace(/,/g, '')))}</small>}
    </label>
  );

  return (
    <div className="fo-page fo-data">
      <h1 className="serif fo-title">F&amp;O Data</h1>
      <div className="fo-subtitle">Upload Nuvama's daily P&amp;L report, and keep margin and cash current.</div>

      <section className="fo-data-sec">
        <div className="fo-sec-head"><h2 className="serif">Daily P&amp;L report</h2><span className="fo-sec-note">Nuvama · Reports → Profit &amp; Loss · Excel</span></div>
        <ul className="fo-steps">
          <li>Set the period to a single day: same From and To date (e.g. today's). Upload one report per trading day; missed days can be uploaded later.</li>
          <li>The file is read in your browser. Only the F&amp;O figures are saved, not the name, phone or email in its header.</li>
        </ul>
        <input type="file" accept=".xlsx" onChange={e => onReportFile(e.target.files?.[0])} />
        {preview && (
          <div className="fo-preview">
            <div><b>{accountLabel(preview.account)}</b> · report of <b>{shortDate(preview.asOf)}</b></div>
            <div className="n">
              {preview.legs.filter(l => l.qty !== 0).length} open legs · {preview.legs.filter(l => l.qty === 0).length} closed ·
              {' '}{preview.trades.length} trades · open P&amp;L {rsSigned(preview.legs.reduce((s, l) => s + l.unrealised, 0))}
            </div>
            {state?.reports.some(r => r.account === preview.account && r.asOf === preview.asOf) && (
              <div className="fo-warn">A report for this day is already saved; this will replace it.</div>
            )}
            <button type="button" className="fo-btn" onClick={saveReport}>Save report</button>
          </div>
        )}
        <Msg m={reportMsg} />
        {state && state.reports.length > 0 && (
          <div className="fo-history">
            <div className="fo-sub-head">Saved reports</div>
            <div className="fo-history-list n">
              {state.reports.slice(0, 25).map(r => (
                <span key={r.account + r.asOf} title={`${r.legs} legs · uploaded ${when(r.uploadedAt)}${r.uploadedBy ? ' by ' + r.uploadedBy : ''}`}>{shortDate(r.asOf)}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      {state && state.accounts.length > 1 && (
        <label className="fo-field fo-account">
          <span>Account</span>
          <select value={account} onChange={e => setAccount(e.target.value)}>
            {state.accounts.map(a => <option key={a} value={a}>{accountLabel(a)}</option>)}
          </select>
        </label>
      )}

      {account ? (
        <>
          <section className="fo-data-sec">
            <div className="fo-sec-head"><h2 className="serif">Margin and cash</h2><span className="fo-sec-note">{accountLabel(account)}{m ? ` · updated ${when(m.updatedAt)}` : ''}</span></div>
            <ul className="fo-steps">
              <li>Copy both from Nuvama's Margin screen with each daily upload. Margin used is calculated from NSE's SPAN file.</li>
            </ul>
            <form onSubmit={saveMargin} className="fo-form">
              {amountField('cash', 'Cash available', 'can be negative', true)}
              {amountField('pledged', 'Margin from pledged holdings')}
              <button type="submit" className="fo-btn">Save</button>
            </form>
            <Msg m={marginMsg} />
          </section>

          <section className="fo-data-sec">
            <div className="fo-sec-head"><h2 className="serif">Holdings in this account</h2>
              <span className="fo-sec-note">{state?.holdings.updatedAt ? `${state.holdings.count} holdings · from the GridKey upload of ${when(state.holdings.updatedAt)}` : 'None yet'}</span>
            </div>
            <ul className="fo-steps">
              <li>Taken from the "{state?.holdings.portfolio}" rows of each GridKey upload, so there's nothing to upload here.</li>
              <li>All of them count as pledged collateral (after NSE haircuts) and give the "% of shares held hedged" on F&amp;O positions.</li>
            </ul>
          </section>
        </>
      ) : state && (
        <div className="fo-empty">Upload a report first; margin and cash are set per account.</div>
      )}
    </div>
  );
}
