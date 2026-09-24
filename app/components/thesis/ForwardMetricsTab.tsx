'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ValuationTableData, ValuationRow, ValuationColumn } from '../../../types/pe';
import { computeCurrentFY, fyLabel, parseFYLabel, deriveForwardTargetDetails, findMetricRow } from '../../../lib/fiscalYear';
import { uuid } from '../../../lib/uuid';

interface ForwardMetricsTabProps {
  stockCode: string;
  stockName?: string;
}

type Metric = NonNullable<ValuationRow['metric']>;

// Locked rows the target price is derived from, in the order they're added.
const METRIC_ROWS: { metric: Metric; label: string; hint: string }[] = [
  { metric: 'ebitda', label: 'EBITDA', hint: '₹ Cr — used with EV/EBITDA when P/E is blank' },
  { metric: 'eps', label: 'EPS', hint: 'Target price = EPS × P/E' },
  { metric: 'pe', label: 'P/E (target)', hint: 'Target price = EPS × P/E' },
  { metric: 'evEbitda', label: 'EV/EBITDA (target)', hint: 'Used when P/E is blank: (EBITDA × EV/EBITDA − net debt) ÷ shares' },
  { metric: 'netDebt', label: 'Net debt (₹ Cr)', hint: 'Negative for net cash. A blank year uses the nearest year’s value' },
  { metric: 'shares', label: 'Shares (Cr)', hint: 'Shares outstanding in crore. A blank year uses the nearest year’s value' },
];
const METRIC_INFO = Object.fromEntries(METRIC_ROWS.map(m => [m.metric, m])) as Record<Metric, (typeof METRIC_ROWS)[number]>;

const DEFAULT_ROWS: Omit<ValuationRow, 'id'>[] = [
  { label: 'Revenue', order: 0 },
  { label: 'EBITDA', order: 1, metric: 'ebitda', locked: true },
  { label: 'PAT', order: 2 },
  { label: METRIC_INFO.eps.label, order: 3, metric: 'eps', locked: true },
  { label: METRIC_INFO.pe.label, order: 4, metric: 'pe', locked: true },
  { label: METRIC_INFO.evEbitda.label, order: 5, metric: 'evEbitda', locked: true },
  { label: METRIC_INFO.netDebt.label, order: 6, metric: 'netDebt', locked: true },
  { label: METRIC_INFO.shares.label, order: 7, metric: 'shares', locked: true },
];

function newId(): string {
  return uuid();
}

// Default columns span the forward window around the current FY: two completed
// years + the current year + the next two estimates (e.g. FY25 · FY26 · FY27E ·
// FY28E · FY29E). This covers all three forward-IRR years out of the box.
function buildDefaultColumns(currentFY: number): Omit<ValuationColumn, 'id'>[] {
  return [-2, -1, 0, 1, 2].map((offset, i) => ({
    year: fyLabel(currentFY + offset, currentFY),
    order: i,
  }));
}

function buildDefault(currentFY: number): ValuationTableData {
  return {
    rows: DEFAULT_ROWS.map(r => ({ ...r, id: newId() })),
    columns: buildDefaultColumns(currentFY).map(c => ({ ...c, id: newId() })),
    cells: {},
  };
}

// Ensure a loaded grid has every locked row the target price is derived from.
// Existing rows with a matching label (e.g. "EPS", "EBITDA") are upgraded in
// place, keeping their id so their cells survive; missing rows are appended.
// Returns the normalized data plus whether rows had to be added (worth persisting).
function normalize(data: ValuationTableData): { data: ValuationTableData; added: boolean } {
  const rows = (data.rows || []).map(r => ({ ...r }));
  let added = false;

  for (const { metric, label } of METRIC_ROWS) {
    const found = findMetricRow({ ...data, rows }, metric);
    const row = found ? rows.find(r => r.id === found.id) : undefined;
    if (row) {
      row.metric = metric;
      row.locked = true;
      row.label = label;
    } else {
      rows.push({ id: newId(), label, order: rows.length, metric, locked: true });
      added = true;
    }
  }

  return { data: { ...data, rows }, added };
}

type SaveStatus = 'idle' | 'saving' | 'saved';

export function ForwardMetricsTab({ stockCode, stockName }: ForwardMetricsTabProps) {
  const [tableData, setTableData] = useState<ValuationTableData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [currentFY, setCurrentFY] = useState<number>(() => computeCurrentFY());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (data: ValuationTableData) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/thesis/${encodeURIComponent(stockCode)}/forward-metrics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableData: data, stockName }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaveStatus('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Forward metrics save error:', err);
      setSaveStatus('idle');
    }
  }, [stockCode, stockName]);

  const markDirty = useCallback((newData: ValuationTableData) => {
    setTableData(newData);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => save(newData), 800);
  }, [save]);

  useEffect(() => {
    // Pick up the admin-controlled current FY so new grids default to the right
    // forward window. Falls back to the date-derived FY if the fetch fails.
    fetch('/api/settings/fiscal-year')
      .then(res => (res.ok ? res.json() : null))
      .then(d => { if (d?.currentFY) setCurrentFY(d.currentFY); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/thesis/${encodeURIComponent(stockCode)}/forward-metrics`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const existing: ValuationTableData | null = data?.tableData ?? null;
        if (existing) {
          const { data: norm, added } = normalize(existing);
          setTableData(norm);
          // Persist once if we had to inject the locked EPS/P/E rows, so the
          // derivation endpoint sees them too.
          if (added) save(norm);
        } else {
          setTableData(buildDefault(currentFY));
        }
      })
      .catch(() => setTableData(buildDefault(currentFY)))
      .finally(() => setIsLoading(false));

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockCode]);

  if (isLoading || !tableData) {
    return <div className="pe-valuation-container"><p className="pe-muted">Loading...</p></div>;
  }

  const { rows, columns, cells } = tableData;

  const cellKey = (rowId: string, colId: string) => `${rowId}:${colId}`;

  const updateCell = (rowId: string, colId: string, value: string) => {
    const parsed = value === '' ? null : parseFloat(value);
    markDirty({ ...tableData, cells: { ...cells, [cellKey(rowId, colId)]: parsed } });
  };

  const updateRowLabel = (rowId: string, label: string) => {
    markDirty({ ...tableData, rows: rows.map(r => r.id === rowId ? { ...r, label } : r) });
  };

  const updateColYear = (colId: string, year: string) => {
    markDirty({ ...tableData, columns: columns.map(c => c.id === colId ? { ...c, year } : c) });
  };

  const addRow = () => {
    markDirty({ ...tableData, rows: [...rows, { id: newId(), label: 'New Row', order: rows.length }] });
  };

  // "+ Year" adds the fiscal year after the latest column (FY29E → FY30E).
  const addColumn = () => {
    const years = columns.map(c => parseFYLabel(c.year)).filter((y): y is number => y != null);
    const next = years.length > 0 ? Math.max(...years) + 1 : currentFY;
    markDirty({ ...tableData, columns: [...columns, { id: newId(), year: fyLabel(next, currentFY), order: columns.length }] });
  };

  const deleteRow = (rowId: string) => {
    if (rows.find(r => r.id === rowId)?.locked) return; // target-price rows are required
    const newRows = rows.filter(r => r.id !== rowId).map((r, i) => ({ ...r, order: i }));
    const newCells = Object.fromEntries(Object.entries(cells).filter(([k]) => !k.startsWith(`${rowId}:`)));
    markDirty({ ...tableData, rows: newRows, cells: newCells });
  };

  const deleteColumn = (colId: string) => {
    const newCols = columns.filter(c => c.id !== colId).map((c, i) => ({ ...c, order: i }));
    const newCells = Object.fromEntries(Object.entries(cells).filter(([k]) => !k.endsWith(`:${colId}`)));
    markDirty({ ...tableData, columns: newCols, cells: newCells });
  };

  const sortedRows = [...rows].sort((a, b) => a.order - b.order);
  const sortedCols = [...columns].sort((a, b) => a.order - b.order);
  const targets = deriveForwardTargetDetails(tableData);

  return (
    <div className="pe-valuation-container">
      <div className="pe-valuation-status">
        {saveStatus === 'saving' && 'Saving...'}
        {saveStatus === 'saved' && 'Saved ✓'}
      </div>

      <div className="pe-valuation-scroll">
        <table className="pe-valuation-table">
          <thead>
            <tr>
              <th className="pe-valuation-corner" />
              {sortedCols.map(col => (
                <th key={col.id}>
                  <div className="pe-valuation-header-cell">
                    <input
                      type="text"
                      className="pe-valuation-label-input pe-valuation-year-input"
                      value={col.year}
                      onChange={e => updateColYear(col.id, e.target.value)}
                    />
                    <button type="button" className="pe-valuation-delete-btn" onClick={() => deleteColumn(col.id)} title="Delete column">×</button>
                  </div>
                </th>
              ))}
              <th className="pe-valuation-add-col-th">
                <button type="button" className="pe-valuation-add-btn" onClick={addColumn}>+ Year</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => (
              <tr key={row.id}>
                <td className="pe-valuation-row-label-cell">
                  <div className="pe-valuation-row-label">
                    {row.locked ? (
                      <span
                        className="pe-valuation-label-input pe-valuation-label-locked"
                        title={row.metric ? METRIC_INFO[row.metric].hint : 'Required row'}
                      >
                        {row.label}
                      </span>
                    ) : (
                      <>
                        <input
                          type="text"
                          className="pe-valuation-label-input"
                          value={row.label}
                          onChange={e => updateRowLabel(row.id, e.target.value)}
                        />
                        <button type="button" className="pe-valuation-delete-btn" onClick={() => deleteRow(row.id)} title="Delete row">×</button>
                      </>
                    )}
                  </div>
                </td>
                {sortedCols.map(col => (
                  <td key={col.id}>
                    <input
                      type="number"
                      className="pe-valuation-cell-input"
                      value={cells[cellKey(row.id, col.id)] ?? ''}
                      onChange={e => updateCell(row.id, col.id, e.target.value)}
                    />
                  </td>
                ))}
                <td />
              </tr>
            ))}
            <tr>
              <td>
                <button type="button" className="pe-valuation-add-btn" onClick={addRow}>+ Row</button>
              </td>
              {sortedCols.map(col => <td key={col.id} />)}
              <td />
            </tr>
            <tr className="pe-valuation-derived-row">
              <td className="pe-valuation-row-label-cell">
                <div className="pe-valuation-row-label">
                  <span className="pe-valuation-label-input pe-valuation-label-locked" title="Derived — drives forward IRR">Target price</span>
                </div>
              </td>
              {sortedCols.map(col => {
                const fy = parseFYLabel(col.year);
                const t = fy != null ? targets[fy] : undefined;
                return (
                  <td key={col.id} className="pe-valuation-derived">
                    {t ? (
                      <>
                        <span className="pe-valuation-derived-price">₹{t.price.toLocaleString('en-IN', { maximumFractionDigits: t.price >= 1000 ? 0 : 1 })}</span>
                        <span className="pe-valuation-derived-method">{t.method === 'pe' ? 'P/E' : 'EV/EBITDA'}</span>
                      </>
                    ) : <span className="pe-valuation-derived-empty">—</span>}
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="pe-valuation-note">
        Target price uses EPS × P/E. Where P/E is blank it uses (EBITDA × EV/EBITDA − net debt) ÷ shares,
        with EBITDA and net debt in ₹ Cr and shares in crore.
      </p>
    </div>
  );
}
