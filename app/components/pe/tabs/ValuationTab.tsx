'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ValuationTableData, ValuationRow, ValuationColumn } from '../../../../types/pe';

interface ValuationTabProps {
  companyId: string;
}

const DEFAULT_ROWS: Omit<ValuationRow, 'id'>[] = [
  { label: 'Valuation', order: 0 },
  { label: 'PAT', order: 1 },
  { label: 'Unit Sales', order: 2 },
  { label: 'AOV', order: 3 },
];

const DEFAULT_COLUMNS: Omit<ValuationColumn, 'id'>[] = [
  { year: 'FY24', order: 0 },
  { year: 'FY25', order: 1 },
  { year: 'FY26E', order: 2 },
  { year: 'FY27E', order: 3 },
];

function newId(): string {
  return crypto.randomUUID();
}

function buildDefault(): ValuationTableData {
  return {
    rows: DEFAULT_ROWS.map(r => ({ ...r, id: newId() })),
    columns: DEFAULT_COLUMNS.map(c => ({ ...c, id: newId() })),
    cells: {},
  };
}

type SaveStatus = 'idle' | 'saving' | 'saved';

export function ValuationTab({ companyId }: ValuationTabProps) {
  const [tableData, setTableData] = useState<ValuationTableData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (data: ValuationTableData) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/pe/${companyId}/valuation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableData: data }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaveStatus('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Valuation save error:', err);
      setSaveStatus('idle');
    }
  }, [companyId]);

  const markDirty = useCallback((newData: ValuationTableData) => {
    setTableData(newData);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => save(newData), 800);
  }, [save]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/pe/${companyId}/valuation`);
        if (res.ok) {
          const data = await res.json();
          setTableData(data.tableData ?? buildDefault());
        }
      } catch (err) {
        console.error('Failed to load valuation:', err);
        setTableData(buildDefault());
      } finally {
        setIsLoading(false);
      }
    })();
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [companyId]);

  if (isLoading || !tableData) {
    return <div className="pe-valuation-container"><p className="pe-muted">Loading...</p></div>;
  }

  const { rows, columns, cells } = tableData;

  const cellKey = (rowId: string, colId: string) => `${rowId}:${colId}`;

  const updateCell = (rowId: string, colId: string, value: string) => {
    const parsed = value === '' ? null : parseFloat(value);
    const newCells = { ...cells, [cellKey(rowId, colId)]: parsed };
    markDirty({ ...tableData, cells: newCells });
  };

  const updateRowLabel = (rowId: string, label: string) => {
    const newRows = rows.map(r => r.id === rowId ? { ...r, label } : r);
    markDirty({ ...tableData, rows: newRows });
  };

  const updateColYear = (colId: string, year: string) => {
    const newCols = columns.map(c => c.id === colId ? { ...c, year } : c);
    markDirty({ ...tableData, columns: newCols });
  };

  const addRow = () => {
    const newRow: ValuationRow = { id: newId(), label: 'New Row', order: rows.length };
    markDirty({ ...tableData, rows: [...rows, newRow] });
  };

  const addColumn = () => {
    const newCol: ValuationColumn = { id: newId(), year: 'FY__', order: columns.length };
    markDirty({ ...tableData, columns: [...columns, newCol] });
  };

  const deleteRow = (rowId: string) => {
    const newRows = rows.filter(r => r.id !== rowId).map((r, i) => ({ ...r, order: i }));
    const newCells = Object.fromEntries(
      Object.entries(cells).filter(([k]) => !k.startsWith(`${rowId}:`))
    );
    markDirty({ ...tableData, rows: newRows, cells: newCells });
  };

  const deleteColumn = (colId: string) => {
    const newCols = columns.filter(c => c.id !== colId).map((c, i) => ({ ...c, order: i }));
    const newCells = Object.fromEntries(
      Object.entries(cells).filter(([k]) => !k.endsWith(`:${colId}`))
    );
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
                    <button
                      type="button"
                      className="pe-valuation-delete-btn"
                      onClick={() => deleteColumn(col.id)}
                      title="Delete column"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
              <th className="pe-valuation-add-col-th">
                <button type="button" className="pe-valuation-add-btn" onClick={addColumn}>
                  + Year
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => (
              <tr key={row.id}>
                <td className="pe-valuation-row-label-cell">
                  <div className="pe-valuation-row-label">
                    <input
                      type="text"
                      className="pe-valuation-label-input"
                      value={row.label}
                      onChange={e => updateRowLabel(row.id, e.target.value)}
                    />
                    <button
                      type="button"
                      className="pe-valuation-delete-btn"
                      onClick={() => deleteRow(row.id)}
                      title="Delete row"
                    >
                      ×
                    </button>
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
                <button type="button" className="pe-valuation-add-btn" onClick={addRow}>
                  + Row
                </button>
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
