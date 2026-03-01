'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Stock, GridKeyData } from '../../types';

interface EntryData {
  entryDate: string;
  entryPrice: number;
}

interface EntryDataPageProps {
  gridKeyData: GridKeyData[];
  stocks: Stock[];
}

interface StockWithEntry {
  code: string;
  name: string;
  currentPrice: number | null;
  averageBuyPrice: number | null;
  quantity: number | null;
  entryDate: string | null;
  entryPrice: number | null;
  hasEntryData: boolean;
}

const EntryDataPage: React.FC<EntryDataPageProps> = ({ gridKeyData, stocks }) => {
  const [entryDataMap, setEntryDataMap] = useState<Record<string, EntryData>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [filter, setFilter] = useState<'all' | 'missing' | 'recorded'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadEntryData();
  }, []);

  const loadEntryData = async () => {
    try {
      const response = await fetch('/api/entry-data');
      if (response.ok) {
        const data = await response.json();
        setEntryDataMap(data);
      }
    } catch (error) {
      console.error('Error loading entry data:', error);
    } finally {
      setLoading(false);
    }
  };

  const stocksWithEntry = useMemo((): StockWithEntry[] => {
    const result: StockWithEntry[] = [];
    const processedCodes = new Set<string>();

    for (const item of gridKeyData) {
      const code = item.nseCode || item.bseCode;
      if (!code || processedCodes.has(code)) continue;
      processedCodes.add(code);

      const matchedStock = stocks.find(s =>
        (s.nseCode && s.nseCode.toLowerCase() === code.toLowerCase()) ||
        (s.bseCode && s.bseCode.toLowerCase() === code.toLowerCase())
      );

      const entry = entryDataMap[code];

      result.push({
        code,
        name: matchedStock?.name || item.scripName || code,
        currentPrice: matchedStock?.currentPrice || null,
        averageBuyPrice: item.averageBuyPrice || null,
        quantity: item.quantity || null,
        entryDate: entry?.entryDate || null,
        entryPrice: entry?.entryPrice || null,
        hasEntryData: !!entry,
      });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [gridKeyData, stocks, entryDataMap]);

  const filteredStocks = useMemo(() => {
    let filtered = stocksWithEntry;

    if (filter === 'missing') {
      filtered = filtered.filter(s => !s.hasEntryData);
    } else if (filter === 'recorded') {
      filtered = filtered.filter(s => s.hasEntryData);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(term) ||
        s.code.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [stocksWithEntry, filter, searchTerm]);

  const handleEdit = (stock: StockWithEntry) => {
    setEditingRow(stock.code);
    setEditDate(stock.entryDate || new Date().toISOString().split('T')[0]);
    setEditPrice(stock.entryPrice?.toString() || stock.averageBuyPrice?.toString() || '');
  };

  const handleSave = async (code: string) => {
    if (!editDate || !editPrice) return;

    setSaving(code);
    try {
      const response = await fetch('/api/entry-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          entryDate: editDate,
          entryPrice: parseFloat(editPrice),
        }),
      });

      if (response.ok) {
        setEntryDataMap(prev => ({
          ...prev,
          [code]: { entryDate: editDate, entryPrice: parseFloat(editPrice) },
        }));
        setEditingRow(null);
      }
    } catch (error) {
      console.error('Error saving entry data:', error);
    } finally {
      setSaving(null);
    }
  };

  const handleCancel = () => {
    setEditingRow(null);
    setEditDate('');
    setEditPrice('');
  };

  const missingCount = stocksWithEntry.filter(s => !s.hasEntryData).length;
  const recordedCount = stocksWithEntry.filter(s => s.hasEntryData).length;

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        Loading entry data...
      </div>
    );
  }

  return (
    <div className="page-container" style={{ padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, marginBottom: '0.5rem' }}>Entry Data Management</h2>
        <p style={{ color: 'var(--secondary-text-color)', margin: 0 }}>
          View and edit entry dates and prices for your holdings
        </p>
      </div>

      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: filter === 'all' ? 'var(--accent-color)' : 'var(--surface-color)',
              color: filter === 'all' ? 'white' : 'var(--primary-text-color)',
              cursor: 'pointer',
            }}
          >
            All ({stocksWithEntry.length})
          </button>
          <button
            onClick={() => setFilter('missing')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: filter === 'missing' ? 'var(--error-color)' : 'var(--surface-color)',
              color: filter === 'missing' ? 'white' : 'var(--primary-text-color)',
              cursor: 'pointer',
            }}
          >
            Missing ({missingCount})
          </button>
          <button
            onClick={() => setFilter('recorded')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: filter === 'recorded' ? 'var(--profit-green)' : 'var(--surface-color)',
              color: filter === 'recorded' ? 'white' : 'var(--primary-text-color)',
              cursor: 'pointer',
            }}
          >
            Recorded ({recordedCount})
          </button>
        </div>

        <input
          type="text"
          placeholder="Search by name or code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--surface-color)',
            color: 'var(--primary-text-color)',
            width: '250px',
          }}
        />
      </div>

      <div style={{
        overflowX: 'auto',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
      }}>
        <table className="stock-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-color)' }}>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Stock</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Code</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>Qty</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>Avg Buy Price</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>Current Price</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>Entry Date</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>Entry Price</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStocks.map((stock) => (
              <tr
                key={stock.code}
                style={{
                  background: !stock.hasEntryData ? 'rgba(255, 100, 100, 0.1)' : 'transparent',
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                <td style={{ padding: '0.75rem 1rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stock.name}
                </td>
                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {stock.code}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                  {stock.quantity?.toLocaleString() || '-'}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                  {stock.averageBuyPrice ? `₹${stock.averageBuyPrice.toLocaleString()}` : '-'}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                  {stock.currentPrice ? `₹${stock.currentPrice.toLocaleString()}` : '-'}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                  {editingRow === stock.code ? (
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--background-color)',
                        color: 'var(--primary-text-color)',
                      }}
                    />
                  ) : (
                    stock.entryDate || <span style={{ color: 'var(--error-color)' }}>Not set</span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                  {editingRow === stock.code ? (
                    <input
                      type="number"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="Price"
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--background-color)',
                        color: 'var(--primary-text-color)',
                        width: '100px',
                        textAlign: 'right',
                      }}
                    />
                  ) : (
                    stock.entryPrice ? `₹${stock.entryPrice.toLocaleString()}` : <span style={{ color: 'var(--error-color)' }}>Not set</span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                  {editingRow === stock.code ? (
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleSave(stock.code)}
                        disabled={saving === stock.code}
                        style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          border: 'none',
                          background: 'var(--profit-green)',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                        }}
                      >
                        {saving === stock.code ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancel}
                        style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          background: 'transparent',
                          color: 'var(--primary-text-color)',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEdit(stock)}
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--surface-color)',
                        color: 'var(--primary-text-color)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredStocks.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--secondary-text-color)' }}>
          No stocks found matching your criteria
        </div>
      )}
    </div>
  );
};

export default EntryDataPage;
