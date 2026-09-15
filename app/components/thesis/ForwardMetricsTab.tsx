'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ValuationTableData, ValuationRow, ValuationColumn } from '../../../types/pe';
import { computeCurrentFY, fyLabel } from '../../../lib/fiscalYear';

interface ForwardMetricsTabProps {
  stockCode: string;
}

const EPS_LABEL = 'EPS';
const PE_LABEL = 'P/E (target)';

const DEFAULT_ROWS: Omit<ValuationRow, 'id'>[] = [
  { label: 'Revenue', order: 0 },
  { label: 'EBITDA', order: 1 },
  { label: 'PAT', order: 2 },
  { label: EPS_LABEL, order: 3, metric: 'eps', locked: true },
  { label: PE_LABEL, order: 4, metric: 'pe', locked: true },
];

function newId(): string {
  return crypto.randomUUID();
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

// Ensure a loaded grid has the locked EPS and P/E rows the app derives target
// prices from. Existing rows named "EPS"/"P/E" are upgraded in place (keeping
// their id so their cells survive); missing rows are appended. Returns the
// normalized data plus whether rows had to be added (worth persisting).
function normalize(data: ValuationTableData): { data: ValuationTableData; added: boolean } {
  const rows = (data.rows || []).map(r => ({ ...r }));
  let added = false;

  const tag = (
    metric: 'eps' | 'pe',
    label: string,
    match: (r: ValuationRow) => boolean,
  ) => {
    let row = rows.find(r => r.metric === metric) ?? rows.find(match);
    if (row) {
      row.metric = metric;
      row.locked = true;
      row.label = label;
    } else {
      rows.push({ id: newId(), label, order: rows.length, metric, locked: true });
      added = true;
    }
  };

  tag('eps', EPS_LABEL, r => /^\s*eps\s*$/i.test(r.label || ''));
  tag('pe', PE_LABEL, r => /p\s*\/?\s*e/i.test(r.label || ''));

  return { data: { ...data, rows }, added };
}

type SaveStatus = 'idle' | 'saving' | 'saved';

export function ForwardMetricsTab({ stockCode }: ForwardMetricsTabProps) {
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
        body: JSON.stringify({ tableData: data }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaveStatus('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Forward metrics save error:', err);
      setSaveStatus('idle');
    }
  }, [stockCode]);

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

  const addColumn = () => {
    markDirty({ ...tableData, columns: [...columns, { id: newId(), year: 'FY__', order: columns.length }] });
  };

  const deleteRow = (rowId: string) => {
    if (rows.find(r => r.id === rowId)?.locked) return; // EPS / P/E are required
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
                        title="Required row — target price is derived from EPS × P/E"
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
