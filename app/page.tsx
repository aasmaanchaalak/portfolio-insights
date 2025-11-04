'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Stock, GridKeyData } from '../types';

type SortKey = keyof Stock;
type SortDirection = 'ascending' | 'descending';

const getPerfColor = (value: number | null): string => {
  if (value === null || value === 0) return 'transparent';
  if (value > 5) return 'var(--positive-color-strong)';
  if (value > 2) return 'var(--positive-color-medium)';
  if (value > 0) return 'var(--positive-color-weak)';
  if (value < -5) return 'var(--negative-color-strong)';
  if (value < -2) return 'var(--negative-color-medium)';
  if (value < 0) return 'var(--negative-color-weak)';
  return 'transparent';
};

const formatValue = (value: number | null, suffix = '') => {
    if (value === null || value === undefined) return 'N/A';
    return `${value}${suffix}`;
};

const perfColumns: { key: keyof Stock; label: string }[] = [
    { key: 'return1D', label: '1D %' },
    { key: 'return1W', label: '1W %' },
    { key: 'return1M', label: '1M %' },
    { key: 'return3M', label: '3M %' },
    { key: 'return6M', label: '6M %' },
    { key: 'return1Y', label: '1Y %' },
];

const allToggleableColumns = [
    { key: 'industry', label: 'Industry' },
    { key: 'currentPrice', label: 'Price' },
    { key: 'currentAmount', label: 'Current Amount' },
    { key: 'weightage', label: 'Weightage %' },
    ...perfColumns,
    { key: 'remarks', label: 'Remarks' },
    { key: 'assignedTo', label: 'Assigned To' },
];

const TEAM_MEMBERS = ['Deepak', 'Aditya', 'Tushar', 'Aayush', 'Daksh', 'Siddhartha'];

const HeatmapCell: React.FC<{ value: number | null }> = ({ value }) => (
    <div
        className="heatmap-cell"
        style={{ backgroundColor: getPerfColor(value) }}
    >
        {formatValue(value, '%')}
    </div>
);


const UploadPage: React.FC<{ onDataUploaded: (data: Stock[]) => void }> = ({ onDataUploaded }) => {
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0]);
            setStatus('');
            setError('');
        }
    };


    const processFile = () => {
        if (!file) {
            setError('Please select a file first.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csvText = event.target?.result as string;
                const lines = csvText.trim().split('\n');

                // Helper function to parse CSV line with proper quote handling
                const parseCSVLine = (line: string): string[] => {
                    const result: string[] = [];
                    let current = '';
                    let inQuotes = false;

                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        const nextChar = line[i + 1];

                        if (char === '"') {
                            if (inQuotes && nextChar === '"') {
                                // Escaped quote
                                current += '"';
                                i++;
                            } else {
                                // Toggle quote state
                                inQuotes = !inQuotes;
                            }
                        } else if (char === ',' && !inQuotes) {
                            // End of field
                            result.push(current.trim());
                            current = '';
                        } else {
                            current += char;
                        }
                    }
                    result.push(current.trim());
                    return result;
                };

                const header = parseCSVLine(lines[0]);

                // Map new column names to internal field names
                const columnMapping: Record<string, keyof Stock> = {
                    'Name': 'name',
                    'Company name': 'name',
                    'BSE Code': 'bseCode',
                    'NSE Code': 'nseCode',
                    'Industry Group': 'industry',
                    'Current Price': 'currentPrice',
                    'Current Price (Rs)': 'currentPrice',
                    'Return over 1day': 'return1D',
                    'Return over 1 Day': 'return1D',
                    'Return over 1 Day (%)': 'return1D',
                    '1-Day Return (%)': 'return1D',
                    'Return over 1week': 'return1W',
                    'Return over 1 Week': 'return1W',
                    'Return over 5 Days (%)': 'return1W',
                    '1-Week Return (%)': 'return1W',
                    'Return over 1month': 'return1M',
                    'Return over 1 Month': 'return1M',
                    'Return over 1 Month (%)': 'return1M',
                    '1-Month Return (%)': 'return1M',
                    'Return over 3months': 'return3M',
                    'Return over 3 Months': 'return3M',
                    'Return over 3 Months (%)': 'return3M',
                    '3-Month Return (%)': 'return3M',
                    'Return over 6months': 'return6M',
                    'Return over 6 Months': 'return6M',
                    'Return over 6 Months (%)': 'return6M',
                    '6-Month Return (%)': 'return6M',
                    'Return over 1year': 'return1Y',
                    'Return over 1 Year': 'return1Y',
                    'Return over 1 Year (%)': 'return1Y',
                    '1-Year Return (%)': 'return1Y'
                };

                const requiredCsvHeaders = [
                    'Name', 'BSE Code', 'NSE Code', 'Current Price',
                    'Return over 1day', 'Return over 1week', 'Return over 1month',
                    'Return over 3months', 'Return over 6months', 'Return over 1year'
                ];

                const missingHeaders = requiredCsvHeaders.filter(h => !header.includes(h));
                if (missingHeaders.length > 0) {
                    throw new Error(`Missing required CSV columns: ${missingHeaders.join(', ')}`);
                }

                const data: Stock[] = lines.slice(1).map((line, lineIndex) => {
                    const values = parseCSVLine(line);
                    const entry: Partial<Stock> = {};

                    header.forEach((csvColumn, index) => {
                        // Skip Industry Group column
                        if (csvColumn === 'Industry Group') {
                            return;
                        }

                        const internalKey = columnMapping[csvColumn];
                        if (!internalKey) return;

                        let value = values[index] ? values[index].trim() : null;

                        if (['currentPrice', 'return1D', 'return1M', 'return1W', 'return3M', 'return6M', 'return1Y'].includes(internalKey)) {
                             // Remove any commas from numbers (e.g., "1,234.56" -> "1234.56")
                             const cleanValue = value ? value.replace(/,/g, '') : null;
                             (entry as any)[internalKey] = (cleanValue === null || cleanValue === '') ? null : parseFloat(cleanValue);
                        } else {
                             (entry as any)[internalKey] = (value === null || value === '') ? null : value;
                        }
                    });

                    // Set industry to null since we're ignoring Industry Group
                    entry.industry = null;

                    return entry as Stock;
                });

                await onDataUploaded(data);
                setStatus('Data updated successfully! Portfolio has been saved.');
                setError('');

            } catch (e: any) {
                setError(`Error parsing file: ${e.message}`);
                setStatus('');
            }
        };

        reader.onerror = () => {
            setError('Failed to read the file.');
            setStatus('');
        };
        
        reader.readAsText(file);
    };

    return (
        <div className="upload-container">
            <header className="main-header">
                <h1>Upload New Portfolio Data</h1>
                <p>Upload a CSV file to replace the existing stock data.</p>
            </header>
            <div className="upload-content">
                <div className="upload-instructions">
                    <h3>File Requirements</h3>
                    <ul>
                        <li>Must be a valid CSV file</li>
                        <li>Must contain the following header columns: <code>Name, BSE Code, NSE Code, Current Price, Return over 1day, Return over 1week, Return over 1month, Return over 3months, Return over 6months, Return over 1year</code></li>
                        <li>Industry Group column is ignored if present</li>
                        <li>Numeric columns can be empty for N/A values.</li>
                    </ul>
                    <h3>What Happens After Upload</h3>
                    <ul>
                        <li>Your portfolio data will be updated in the app immediately.</li>
                        <li>Remarks and assignments are saved per NSE/BSE code and persist across uploads.</li>
                        <li>Data is automatically saved to the server.</li>
                        <li>No manual file management required!</li>
                    </ul>
                </div>

                <div className="upload-action-area">
                    <div className="filter-group">
                        <label htmlFor="file-upload">CSV File</label>
                        <input type="file" id="file-upload" accept=".csv" onChange={handleFileChange} />
                    </div>
                    <button className="process-btn" onClick={processFile} disabled={!file}>
                        Process File
                    </button>
                    {status && <div className="status-message success">{status}</div>}
                    {error && <div className="status-message error">{error}</div>}
                </div>
            </div>
        </div>
    );
};


const PortfolioTable: React.FC<{ stocks: Stock[]; onStocksUpdate: (stocks: Stock[]) => void; gridKeyData: GridKeyData[] }> = ({ stocks, onStocksUpdate, gridKeyData }) => {
    const industries = useMemo(() => ['All', ...Array.from(new Set(stocks.map(s => s.industry).filter(ind => ind !== null))).sort()], [stocks]);

    // Map GridKey data to stocks and calculate current amount from quantity * current price
    const stocksWithAmounts = useMemo(() => {
        return stocks.map(stock => {
            const gridKeyMatch = gridKeyData.find(gk => {
                if (gk.nseCode && stock.nseCode) {
                    return gk.nseCode.toLowerCase() === stock.nseCode.toLowerCase();
                }
                if (gk.bseCode && stock.bseCode) {
                    return gk.bseCode.toLowerCase() === stock.bseCode.toLowerCase();
                }
                return false;
            });
            const quantity = gridKeyMatch?.quantity || null;
            const calculatedAmount = (quantity && stock.currentPrice) ? quantity * stock.currentPrice : null;
            return {
                ...stock,
                currentAmount: calculatedAmount
            };
        });
    }, [stocks, gridKeyData]);

    // Calculate total portfolio value
    const totalPortfolioValue = useMemo(() => {
        return stocksWithAmounts.reduce((total, stock) => {
            const amount = (stock as any).currentAmount;
            return total + (amount || 0);
        }, 0);
    }, [stocksWithAmounts]);

    // Calculate weightage for each stock
    const stocksWithWeightage = useMemo(() => {
        return stocksWithAmounts.map(stock => {
            const amount = (stock as any).currentAmount;
            const weightage = totalPortfolioValue > 0 && amount
                ? (amount / totalPortfolioValue) * 100
                : null;
            return {
                ...stock,
                weightage
            };
        });
    }, [stocksWithAmounts, totalPortfolioValue]);
    const [filters, setFilters] = useState({
        industry: 'All',
        min1YReturn: '',
        max1MReturn: '',
        searchTerm: '',
        minPrice: '',
        maxPrice: '',
        remarksSearch: '',
        assignedTo: 'All',
    });

    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [showFilterPopover, setShowFilterPopover] = useState(false);
    const [editingRemark, setEditingRemark] = useState<string | null>(null);
    const [remarkValue, setRemarkValue] = useState<string>('');
    const [editingAssignment, setEditingAssignment] = useState<string | null>(null);
    const [deleteConfirmStock, setDeleteConfirmStock] = useState<Stock | null>(null);

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
        key: 'name',
        direction: 'ascending',
    });

    const initialVisibleColumns = allToggleableColumns.reduce((acc, col) => {
        acc[col.key as string] = true;
        return acc;
    }, {} as Record<string, boolean>);

    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(initialVisibleColumns);

    const toggleColumn = (key: string) => {
        setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleRemarkEdit = (stockName: string, currentRemark: string | null | undefined) => {
        setEditingRemark(stockName);
        setRemarkValue(currentRemark || '');
    };

    const handleRemarkSave = async (stock: Stock) => {
        const code = stock.nseCode || stock.bseCode;
        if (!code) return;

        try {
            const response = await fetch('/api/remarks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, remark: remarkValue })
            });

            if (response.ok) {
                // Update local stocks array
                const updatedStocks = stocks.map(s =>
                    s.name === stock.name ? { ...s, remarks: remarkValue || null } : s
                );
                onStocksUpdate(updatedStocks);
                setEditingRemark(null);
            }
        } catch (error) {
            console.error('Error saving remark:', error);
        }
    };

    const handleRemarkCancel = () => {
        setEditingRemark(null);
        setRemarkValue('');
    };

    const handleAssignmentChange = async (stock: Stock, assignedTo: string) => {
        const code = stock.nseCode || stock.bseCode;
        if (!code) return;

        try {
            const response = await fetch('/api/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, assignedTo: assignedTo || null })
            });

            if (response.ok) {
                // Update local stocks array
                const updatedStocks = stocks.map(s =>
                    s.name === stock.name ? { ...s, assignedTo: assignedTo || null } : s
                );
                onStocksUpdate(updatedStocks);
                setEditingAssignment(null);
            }
        } catch (error) {
            console.error('Error saving assignment:', error);
        }
    };

    const handleDeleteClick = (stock: Stock) => {
        setDeleteConfirmStock(stock);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteConfirmStock) return;

        try {
            const updatedStocks = stocks.filter(s => s.name !== deleteConfirmStock.name);

            // Update via API
            const response = await fetch('/api/portfolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: updatedStocks })
            });

            if (response.ok) {
                onStocksUpdate(updatedStocks);
                setDeleteConfirmStock(null);
            }
        } catch (error) {
            console.error('Error deleting stock:', error);
        }
    };

    const handleDeleteCancel = () => {
        setDeleteConfirmStock(null);
    };

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const filteredAndSortedStocks = useMemo(() => {
        let filtered = [...stocksWithWeightage];

        if (filters.searchTerm) {
            filtered = filtered.filter(s => s.name.toLowerCase().includes(filters.searchTerm.toLowerCase()));
        }

        if (filters.industry !== 'All') {
            filtered = filtered.filter(s => s.industry === filters.industry);
        }

        if (filters.minPrice !== '') {
            const min = parseFloat(filters.minPrice);
            if (!isNaN(min)) {
                filtered = filtered.filter(s => s.currentPrice !== null && s.currentPrice >= min);
            }
        }

        if (filters.maxPrice !== '') {
            const max = parseFloat(filters.maxPrice);
            if (!isNaN(max)) {
                filtered = filtered.filter(s => s.currentPrice !== null && s.currentPrice <= max);
            }
        }

        if (filters.min1YReturn !== '') {
            const minReturn = parseFloat(filters.min1YReturn);
            if (!isNaN(minReturn)) {
                filtered = filtered.filter(s => s.return1Y !== null && s.return1Y >= minReturn);
            }
        }

        if (filters.max1MReturn !== '') {
            const maxReturn = parseFloat(filters.max1MReturn);
            if (!isNaN(maxReturn)) {
                filtered = filtered.filter(s => s.return1M !== null && s.return1M <= maxReturn);
            }
        }

        if (filters.remarksSearch) {
            filtered = filtered.filter(s =>
                s.remarks && s.remarks.toLowerCase().includes(filters.remarksSearch.toLowerCase())
            );
        }

        if (filters.assignedTo !== 'All') {
            if (filters.assignedTo === 'Unassigned') {
                filtered = filtered.filter(s => !s.assignedTo);
            } else {
                filtered = filtered.filter(s => s.assignedTo === filters.assignedTo);
            }
        }

        filtered.sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (aValue === null) return 1;
            if (bValue === null) return -1;
            if (aValue === undefined) return 1;
            if (bValue === undefined) return -1;

            if (aValue < bValue) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });

        return filtered;
    }, [filters, sortConfig, stocksWithWeightage]);
    
    const SortIndicator: React.FC<{ columnKey: SortKey }> = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return null;
        return <span className="sort-indicator">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>;
    };

    const ActiveFilters = () => {
        const activeFilters: { key: string; label: string }[] = [];
        if (filters.searchTerm) {
            activeFilters.push({ key: 'searchTerm', label: `Search: "${filters.searchTerm}"` });
        }
        if (filters.industry !== 'All') {
            activeFilters.push({ key: 'industry', label: `Industry: ${filters.industry}`});
        }
        if (filters.minPrice) {
            activeFilters.push({ key: 'minPrice', label: `Min Price: ${filters.minPrice}` });
        }
        if (filters.maxPrice) {
            activeFilters.push({ key: 'maxPrice', label: `Max Price: ${filters.maxPrice}` });
        }
        if (filters.min1YReturn) {
            activeFilters.push({ key: 'min1YReturn', label: `Min 1Y Return: ${filters.min1YReturn}%` });
        }
        if (filters.max1MReturn) {
            activeFilters.push({ key: 'max1MReturn', label: `Max 1M Return: ${filters.max1MReturn}%` });
        }
        if (filters.remarksSearch) {
            activeFilters.push({ key: 'remarksSearch', label: `Remarks: "${filters.remarksSearch}"` });
        }
        if (filters.assignedTo !== 'All') {
            activeFilters.push({ key: 'assignedTo', label: `Assigned: ${filters.assignedTo}` });
        }

        if (activeFilters.length === 0) return null;

        const defaultValues = { industry: 'All', min1YReturn: '', max1MReturn: '', searchTerm: '', minPrice: '', maxPrice: '', remarksSearch: '', assignedTo: 'All' };
        const clearFilter = (key: keyof typeof filters) => {
            setFilters(prev => ({...prev, [key]: defaultValues[key]}));
        }

        const clearAll = () => {
            setFilters(defaultValues);
        }

        return (
            <div className="active-filters-container">
                <span className="active-filters-label">Active Filters:</span>
                <div className="pills-container">
                    {activeFilters.map(filter => (
                        <div key={filter.key} className="filter-pill">
                            <span>{filter.label}</span>
                            <button onClick={() => clearFilter(filter.key as keyof typeof filters)}>×</button>
                        </div>
                    ))}
                    <button className="clear-all-btn" onClick={clearAll}>Clear All</button>
                </div>
            </div>
        )
    }

    const FilterPopover = () => (
        <div className="popover-backdrop" onClick={() => setShowFilterPopover(false)}>
            <div className="popover-content" onClick={e => e.stopPropagation()}>
                <div className="popover-header">
                    <h3>Filter & View Options</h3>
                    <button className="close-btn" onClick={() => setShowFilterPopover(false)}>×</button>
                </div>
                <div className="popover-body">
                     <div className="filter-group">
                        <label htmlFor="industry">Industry</label>
                        <select id="industry" name="industry" value={filters.industry} onChange={handleFilterChange}>
                            {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                        </select>
                    </div>

                    <div className="filter-group">
                        <label htmlFor="assignedTo">Assigned To</label>
                        <select id="assignedTo" name="assignedTo" value={filters.assignedTo} onChange={handleFilterChange}>
                            <option value="All">All</option>
                            <option value="Unassigned">Unassigned</option>
                            {TEAM_MEMBERS.map(member => <option key={member} value={member}>{member}</option>)}
                        </select>
                    </div>

                    <div className="advanced-filters-toggle">
                       <button className="advanced-filter-btn" onClick={() => setShowAdvancedFilters(p => !p)}>
                           Advanced Filters {showAdvancedFilters ? '▲' : '▼'}
                       </button>
                    </div>
                
                    {showAdvancedFilters && (
                        <div className="advanced-filters-content">
                            <div className="filter-group">
                                <label htmlFor="minPrice">Min Price</label>
                                <input type="number" id="minPrice" name="minPrice" placeholder="e.g. 100" value={filters.minPrice} onChange={handleFilterChange} />
                            </div>
                            <div className="filter-group">
                                <label htmlFor="maxPrice">Max Price</label>
                                <input type="number" id="maxPrice" name="maxPrice" placeholder="e.g. 1000" value={filters.maxPrice} onChange={handleFilterChange} />
                            </div>
                            <div className="filter-group">
                                <label htmlFor="min1YReturn">Min 1-Year Return (%)</label>
                                <input type="number" id="min1YReturn" name="min1YReturn" placeholder="e.g. 20" value={filters.min1YReturn} onChange={handleFilterChange} />
                            </div>
                             <div className="filter-group">
                                <label htmlFor="max1MReturn">Max 1-Month Return (%)</label>
                                <input type="number" id="max1MReturn" name="max1MReturn" placeholder="e.g. -10" value={filters.max1MReturn} onChange={handleFilterChange} />
                            </div>
                            <div className="filter-group">
                                <label htmlFor="remarksSearch">Search Remarks</label>
                                <input type="text" id="remarksSearch" name="remarksSearch" placeholder="Search in remarks..." value={filters.remarksSearch} onChange={handleFilterChange} />
                            </div>
                        </div>
                    )}

                    <div className="column-toggles-container">
                        <label>Show/Hide Columns</label>
                        <div className="column-toggles">
                            {allToggleableColumns.map(col => (
                                <div key={col.key} className="toggle-group">
                                    <input type="checkbox" id={`toggle-${col.key}`} checked={!!visibleColumns[col.key]} onChange={() => toggleColumn(col.key)} />
                                    <label htmlFor={`toggle-${col.key}`}>{col.label}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <header className="main-header">
                <h1>Portfolio Insights</h1>
                <p>Analyze stock performance with advanced sorting and filtering.</p>
                {totalPortfolioValue > 0 && (
                    <div className="portfolio-summary">
                        <span className="portfolio-label">Total Portfolio Value:</span>
                        <span className="portfolio-value">₹{totalPortfolioValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                )}
            </header>

            <ActiveFilters />

            <div className="action-bar">
                <div className="search-bar">
                     <input type="search" name="searchTerm" placeholder="Search by name..." value={filters.searchTerm} onChange={handleFilterChange} />
                </div>
                <button className="filter-btn" onClick={() => setShowFilterPopover(true)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1.5A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5z"/>
                    </svg>
                    Filters
                </button>
            </div>

            {showFilterPopover && <FilterPopover />}
            
            <div className="stock-table-container">
                <table className="stock-table">
                    <thead>
                        <tr>
                            <th className="sticky-col" onClick={() => requestSort('name')}>
                                <div className="th-content">
                                    <span>Name <SortIndicator columnKey="name" /></span>
                                </div>
                            </th>
                             {visibleColumns['industry'] && <th className="industry-col" onClick={() => requestSort('industry')}>
                                <div className="th-content">
                                    <span>Industry <SortIndicator columnKey="industry" /></span>
                                    <button
                                        className="hide-column-btn"
                                        aria-label="Hide Industry column"
                                        title="Hide Industry column"
                                        onClick={(e) => { e.stopPropagation(); toggleColumn('industry'); }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </th>}
                            {visibleColumns['currentPrice'] && <th className="text-right" onClick={() => requestSort('currentPrice')}>
                                <div className="th-content">
                                    <span>Price <SortIndicator columnKey="currentPrice" /></span>
                                    <button
                                        className="hide-column-btn"
                                        aria-label="Hide Price column"
                                        title="Hide Price column"
                                        onClick={(e) => { e.stopPropagation(); toggleColumn('currentPrice'); }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </th>}
                            {visibleColumns['currentAmount'] && <th className="text-right" onClick={() => requestSort('currentAmount' as SortKey)}>
                                <div className="th-content">
                                    <span>Current Amount <SortIndicator columnKey={'currentAmount' as SortKey} /></span>
                                    <button
                                        className="hide-column-btn"
                                        aria-label="Hide Current Amount column"
                                        title="Hide Current Amount column"
                                        onClick={(e) => { e.stopPropagation(); toggleColumn('currentAmount'); }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </th>}
                            {visibleColumns['weightage'] && <th className="text-right" onClick={() => requestSort('weightage' as SortKey)}>
                                <div className="th-content">
                                    <span>Weightage % <SortIndicator columnKey={'weightage' as SortKey} /></span>
                                    <button
                                        className="hide-column-btn"
                                        aria-label="Hide Weightage column"
                                        title="Hide Weightage column"
                                        onClick={(e) => { e.stopPropagation(); toggleColumn('weightage'); }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </th>}
                            {perfColumns.map(col => (
                                visibleColumns[col.key] && <th key={col.key} className="text-right" onClick={() => requestSort(col.key)}>
                                    <div className="th-content">
                                        <span>{col.label} <SortIndicator columnKey={col.key} /></span>
                                        <button
                                            className="hide-column-btn"
                                            aria-label={`Hide ${col.label} column`}
                                            title={`Hide ${col.label} column`}
                                            onClick={(e) => { e.stopPropagation(); toggleColumn(col.key); }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                </th>
                            ))}
                            {visibleColumns['remarks'] && <th onClick={() => requestSort('remarks' as SortKey)}>
                                <div className="th-content">
                                    <span>Remarks <SortIndicator columnKey={'remarks' as SortKey} /></span>
                                    <button
                                        className="hide-column-btn"
                                        aria-label="Hide Remarks column"
                                        title="Hide Remarks column"
                                        onClick={(e) => { e.stopPropagation(); toggleColumn('remarks'); }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </th>}
                            {visibleColumns['assignedTo'] && <th onClick={() => requestSort('assignedTo' as SortKey)}>
                                <div className="th-content">
                                    <span>Assigned To <SortIndicator columnKey={'assignedTo' as SortKey} /></span>
                                    <button
                                        className="hide-column-btn"
                                        aria-label="Hide Assigned To column"
                                        title="Hide Assigned To column"
                                        onClick={(e) => { e.stopPropagation(); toggleColumn('assignedTo'); }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </th>}
                            <th className="actions-col">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAndSortedStocks.map(stock => (
                            <tr key={stock.name}>
                                <td className="sticky-col">
                                    {stock.nseCode || stock.bseCode ? (
                                        <a href={`https://www.screener.in/company/${stock.nseCode || stock.bseCode}/`} target="_blank" rel="noopener noreferrer">
                                            {stock.name}
                                        </a>
                                    ) : (
                                        stock.name
                                    )}
                                </td>
                                {visibleColumns['industry'] && <td className="industry-col">{stock.industry}</td>}
                                {visibleColumns['currentPrice'] && <td className="text-right">{formatValue(stock.currentPrice)}</td>}
                                {visibleColumns['currentAmount'] && <td className="text-right current-amount-cell">{formatValue((stock as any).currentAmount)}</td>}
                                {visibleColumns['weightage'] && <td className="text-right weightage-cell">
                                    {(stock as any).weightage !== null ? `${((stock as any).weightage).toFixed(2)}%` : 'N/A'}
                                </td>}
                                {perfColumns.map(col => (
                                    visibleColumns[col.key] &&
                                    <td key={col.key} className="heatmap-td">
                                        <HeatmapCell value={stock[col.key] as number | null} />
                                    </td>
                                ))}
                                {visibleColumns['remarks'] && <td className="remarks-cell">
                                    {editingRemark === stock.name ? (
                                        <div className="remark-edit">
                                            <input
                                                type="text"
                                                value={remarkValue}
                                                onChange={(e) => setRemarkValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRemarkSave(stock);
                                                    if (e.key === 'Escape') handleRemarkCancel();
                                                }}
                                                autoFocus
                                            />
                                            <button onClick={() => handleRemarkSave(stock)} className="save-btn">✓</button>
                                            <button onClick={handleRemarkCancel} className="cancel-btn">✕</button>
                                        </div>
                                    ) : (
                                        <div className="remark-display" onClick={() => handleRemarkEdit(stock.name, stock.remarks)}>
                                            {stock.remarks || <span className="remark-placeholder">Add remark...</span>}
                                        </div>
                                    )}
                                </td>}
                                {visibleColumns['assignedTo'] && <td className="assignment-cell">
                                    <select
                                        value={stock.assignedTo || ''}
                                        onChange={(e) => handleAssignmentChange(stock, e.target.value)}
                                        className="assignment-select"
                                    >
                                        <option value="">Unassigned</option>
                                        {TEAM_MEMBERS.map(member => (
                                            <option key={member} value={member}>{member}</option>
                                        ))}
                                    </select>
                                </td>}
                                <td className="actions-cell">
                                    <button
                                        onClick={() => handleDeleteClick(stock)}
                                        className="delete-btn"
                                        aria-label="Delete stock"
                                        title="Delete stock from portfolio"
                                    >
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {deleteConfirmStock && (
                <div className="delete-confirm-backdrop" onClick={handleDeleteCancel}>
                    <div className="delete-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <h3>Confirm Delete</h3>
                        <p>Are you sure you want to delete <strong>{deleteConfirmStock.name}</strong> from your portfolio?</p>
                        <p className="warning-text">This action cannot be undone.</p>
                        <div className="dialog-actions">
                            <button onClick={handleDeleteCancel} className="cancel-dialog-btn">Cancel</button>
                            <button onClick={handleDeleteConfirm} className="confirm-delete-btn">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};


const GridKeyPage: React.FC<{ onGridKeyUploaded: (data: GridKeyData[]) => void }> = ({ onGridKeyUploaded }) => {
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0]);
            setStatus('');
            setError('');
        }
    };

    const processFile = () => {
        if (!file) {
            setError('Please select a file first.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const csvText = event.target?.result as string;
                const lines = csvText.trim().split('\n');

                // Helper function to parse CSV line with proper quote handling
                const parseCSVLine = (line: string): string[] => {
                    const result: string[] = [];
                    let current = '';
                    let inQuotes = false;

                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        const nextChar = line[i + 1];

                        if (char === '"') {
                            if (inQuotes && nextChar === '"') {
                                current += '"';
                                i++;
                            } else {
                                inQuotes = !inQuotes;
                            }
                        } else if (char === ',' && !inQuotes) {
                            result.push(current.trim());
                            current = '';
                        } else {
                            current += char;
                        }
                    }
                    result.push(current.trim());
                    return result;
                };

                const header = parseCSVLine(lines[0]);

                const requiredHeaders = ['Asset name', 'Bse', 'Nse', 'Quantity', 'Average buy price'];
                const missingHeaders = requiredHeaders.filter(h => {
                    if (h === 'Quantity') {
                        return !header.some(col => col === 'Quantity' || col === 'quantity' || col.toLowerCase().includes('quantity'));
                    }
                    if (h === 'Average buy price') {
                        return !header.some(col =>
                            col === 'Average buy price' ||
                            col === 'Avg. buy price' ||
                            col === 'Average Buy Price' ||
                            (col.toLowerCase().includes('avg') && col.toLowerCase().includes('buy') && col.toLowerCase().includes('price'))
                        );
                    }
                    return !header.includes(h);
                });
                if (missingHeaders.length > 0) {
                    throw new Error(`Missing required CSV columns: ${missingHeaders.join(', ')}`);
                }

                const data: GridKeyData[] = lines.slice(1).map((line) => {
                    const values = parseCSVLine(line);
                    const scripName = values[header.indexOf('Asset name')] || '';
                    const bseCode = values[header.indexOf('Bse')] || null;
                    const nseCode = values[header.indexOf('Nse')] || null;

                    // Required fields for quantity and average buy price
                    const quantityColIndex = header.findIndex(h =>
                        h === 'Quantity' || h === 'quantity' || h.toLowerCase().includes('quantity')
                    );
                    const quantityStr = quantityColIndex >= 0 ? values[quantityColIndex] : null;
                    const cleanQuantity = quantityStr ? quantityStr.replace(/,/g, '') : null;
                    const quantity = cleanQuantity ? parseFloat(cleanQuantity) : null;

                    const avgBuyPriceColIndex = header.findIndex(h =>
                        h === 'Average buy price' ||
                        h === 'Avg. buy price' ||
                        h === 'Average Buy Price' ||
                        (h.toLowerCase().includes('avg') && h.toLowerCase().includes('buy') && h.toLowerCase().includes('price'))
                    );
                    const avgBuyPriceStr = avgBuyPriceColIndex >= 0 ? values[avgBuyPriceColIndex] : null;
                    const cleanAvgBuyPrice = avgBuyPriceStr ? avgBuyPriceStr.replace(/,/g, '') : null;
                    const averageBuyPrice = cleanAvgBuyPrice ? parseFloat(cleanAvgBuyPrice) : null;

                    return {
                        scripName,
                        bseCode: bseCode && bseCode !== '' ? bseCode : null,
                        nseCode: nseCode && nseCode !== '' ? nseCode : null,
                        quantity,
                        averageBuyPrice
                    };
                });

                // Filter out stocks with no BSE or NSE code
                const filtered = data.filter(item => item.bseCode || item.nseCode);

                onGridKeyUploaded(filtered);
                setStatus(`GridKey data uploaded successfully! ${filtered.length} stocks processed. View Portfolio View to see current amounts.`);
                setError('');
            } catch (e: any) {
                setError(`Error parsing file: ${e.message}`);
                setStatus('');
            }
        };

        reader.onerror = () => {
            setError('Failed to read the file.');
            setStatus('');
        };

        reader.readAsText(file);
    };

    return (
        <div className="upload-container">
            <header className="main-header">
                <h1>GridKey Data Upload</h1>
                <p>Upload GridKey CSV file to map holdings to your portfolio.</p>
            </header>
            <div className="upload-content">
                <div className="upload-instructions">
                    <h3>File Requirements</h3>
                    <ul>
                        <li>Must be a valid CSV file</li>
                        <li>Required columns: <code>Asset name, Bse, Nse, Quantity, Average buy price</code></li>
                        <li>Stocks without BSE/NSE codes will be filtered out</li>
                        <li>Current amount is calculated automatically from quantity × current price</li>
                    </ul>
                    <h3>What Happens After Upload</h3>
                    <ul>
                        <li>Stocks are matched with your portfolio using BSE/NSE codes</li>
                        <li>Current amount is calculated and displayed alongside matched stocks</li>
                        <li>View Portfolio Insights page to see complete holdings details</li>
                    </ul>
                </div>

                <div className="upload-action-area">
                    <div className="filter-group">
                        <label htmlFor="gridkey-file-upload">CSV File</label>
                        <input type="file" id="gridkey-file-upload" accept=".csv" onChange={handleFileChange} />
                    </div>
                    <button className="process-btn" onClick={processFile} disabled={!file}>
                        Process File
                    </button>
                    {status && <div className="status-message success">{status}</div>}
                    {error && <div className="status-message error">{error}</div>}
                </div>
            </div>
        </div>
    );
};


const PortfolioInsightsPage: React.FC<{ gridKeyData: GridKeyData[]; stocks: Stock[] }> = ({ gridKeyData, stocks }) => {
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({
        key: 'scripName',
        direction: 'ascending',
    });

    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // Enrich GridKey data with current price from portfolio stocks and calculate current amount
    const enrichedData = useMemo(() => {
        return gridKeyData.map(item => {
            const matchedStock = stocks.find(stock => {
                if (item.nseCode && stock.nseCode) {
                    return item.nseCode.toLowerCase() === stock.nseCode.toLowerCase();
                }
                if (item.bseCode && stock.bseCode) {
                    return item.bseCode.toLowerCase() === stock.bseCode.toLowerCase();
                }
                return false;
            });
            const currentPrice = matchedStock?.currentPrice || null;
            const calculatedAmount = (item.quantity && currentPrice) ? item.quantity * currentPrice : null;
            return {
                ...item,
                currentPrice,
                calculatedAmount
            };
        });
    }, [gridKeyData, stocks]);

    const sortedData = useMemo(() => {
        const sorted = [...enrichedData];
        sorted.sort((a, b) => {
            const aValue = (a as any)[sortConfig.key];
            const bValue = (b as any)[sortConfig.key];

            if (aValue === null || aValue === undefined) return 1;
            if (bValue === null || bValue === undefined) return -1;

            if (aValue < bValue) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });
        return sorted;
    }, [enrichedData, sortConfig]);

    const SortIndicator: React.FC<{ columnKey: string }> = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return null;
        return <span className="sort-indicator">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>;
    };

    const totalCurrentAmount = useMemo(() => {
        return enrichedData.reduce((total, item) => total + ((item as any).calculatedAmount || 0), 0);
    }, [enrichedData]);

    return (
        <>
            <header className="main-header">
                <h1>Portfolio Insights</h1>
                <p>View your holdings details including quantity and average buy price.</p>
                {totalCurrentAmount > 0 && (
                    <div className="portfolio-summary">
                        <span className="portfolio-label">Total Holdings Value:</span>
                        <span className="portfolio-value">₹{totalCurrentAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                )}
            </header>

            {gridKeyData.length === 0 ? (
                <div className="empty-state">
                    <p>No holdings data available. Please upload GridKey data first.</p>
                </div>
            ) : (
                <div className="stock-table-container">
                    <table className="stock-table">
                        <thead>
                            <tr>
                                <th onClick={() => requestSort('scripName')}>
                                    <div className="th-content">
                                        <span>Stock Name <SortIndicator columnKey="scripName" /></span>
                                    </div>
                                </th>
                                <th className="text-right" onClick={() => requestSort('quantity')}>
                                    <div className="th-content">
                                        <span>Quantity <SortIndicator columnKey="quantity" /></span>
                                    </div>
                                </th>
                                <th className="text-right" onClick={() => requestSort('averageBuyPrice')}>
                                    <div className="th-content">
                                        <span>Average Buy Price <SortIndicator columnKey="averageBuyPrice" /></span>
                                    </div>
                                </th>
                                <th className="text-right" onClick={() => requestSort('currentPrice')}>
                                    <div className="th-content">
                                        <span>Current Price <SortIndicator columnKey="currentPrice" /></span>
                                    </div>
                                </th>
                                <th className="text-right" onClick={() => requestSort('calculatedAmount')}>
                                    <div className="th-content">
                                        <span>Current Amount <SortIndicator columnKey="calculatedAmount" /></span>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedData.map((item, index) => (
                                <tr key={`${item.scripName}-${index}`}>
                                    <td>
                                        {item.nseCode || item.bseCode ? (
                                            <a href={`https://www.screener.in/company/${item.nseCode || item.bseCode}/`} target="_blank" rel="noopener noreferrer">
                                                {item.scripName}
                                            </a>
                                        ) : (
                                            item.scripName
                                        )}
                                    </td>
                                    <td className="text-right">{item.quantity !== null && item.quantity !== undefined ? item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : 'N/A'}</td>
                                    <td className="text-right">{item.averageBuyPrice !== null && item.averageBuyPrice !== undefined ? `₹${item.averageBuyPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A'}</td>
                                    <td className="text-right">{(item as any).currentPrice !== null && (item as any).currentPrice !== undefined ? `₹${(item as any).currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A'}</td>
                                    <td className="text-right current-amount-cell">{(item as any).calculatedAmount !== null && (item as any).calculatedAmount !== undefined ? `₹${(item as any).calculatedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
};


const App: React.FC = () => {
    const [page, setPage] = useState<'table' | 'upload' | 'gridkey' | 'insights'>('table');
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [gridKeyData, setGridKeyData] = useState<GridKeyData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                // Load portfolio data
                const portfolioResponse = await fetch('/api/portfolio');
                if (!portfolioResponse.ok) {
                    throw new Error('Failed to fetch portfolio data');
                }
                const portfolioData = await portfolioResponse.json();
                setStocks(portfolioData);

                // Load GridKey data
                const gridKeyResponse = await fetch('/api/gridkey');
                if (gridKeyResponse.ok) {
                    const gridKeyData = await gridKeyResponse.json();
                    setGridKeyData(gridKeyData);
                }
            } catch (error) {
                console.error('Error loading data:', error);
                // Fallback to empty array
                setStocks([]);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    const handleDataUploaded = async (newData: Stock[]) => {
        try {
            // Update via API
            const response = await fetch('/api/portfolio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: newData }),
            });

            if (!response.ok) {
                throw new Error('Failed to update portfolio data');
            }

            // Reload data from API to get remarks and assignments merged
            const getResponse = await fetch('/api/portfolio');
            if (getResponse.ok) {
                const fullData = await getResponse.json();
                setStocks(fullData);
            } else {
                setStocks(newData);
            }

            setTimeout(() => setPage('table'), 500);
        } catch (error) {
            console.error('Error updating portfolio data:', error);
            // Still update the UI even if API fails
            setStocks(newData);
        }
    };

    const handleGridKeyUploaded = async (data: GridKeyData[]) => {
        try {
            // Save to API
            const response = await fetch('/api/gridkey', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data }),
            });

            if (!response.ok) {
                throw new Error('Failed to save GridKey data');
            }

            setGridKeyData(data);
            setTimeout(() => setPage('table'), 1000);
        } catch (error) {
            console.error('Error saving GridKey data:', error);
            // Still update the UI even if API fails
            setGridKeyData(data);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div>Loading portfolio data...</div>
            </div>
        );
    }

    return (
        <>
            <nav className="main-nav">
                <button className={page === 'table' ? 'active' : ''} onClick={() => setPage('table')}>Portfolio View</button>
                <button className={page === 'insights' ? 'active' : ''} onClick={() => setPage('insights')}>Portfolio Insights</button>
                <button className={page === 'upload' ? 'active' : ''} onClick={() => setPage('upload')}>Upload Data</button>
                <button className={page === 'gridkey' ? 'active' : ''} onClick={() => setPage('gridkey')}>GridKey Data</button>
            </nav>
            <main>
                {page === 'table' && <PortfolioTable stocks={stocks} onStocksUpdate={setStocks} gridKeyData={gridKeyData} />}
                {page === 'insights' && <PortfolioInsightsPage gridKeyData={gridKeyData} stocks={stocks} />}
                {page === 'upload' && <UploadPage onDataUploaded={handleDataUploaded} />}
                {page === 'gridkey' && <GridKeyPage onGridKeyUploaded={handleGridKeyUploaded} />}
            </main>
        </>
    );
}

export default App;