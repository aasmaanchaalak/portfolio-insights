'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Stock } from '../types';

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
    ...perfColumns,
];

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
                const header = lines[0].split(',').map(h => h.trim());
                
                const requiredHeaders: (keyof Stock)[] = [
                    'name', 'bseCode', 'nseCode', 'industry', 'currentPrice', 
                    'return1D', 'return1M', 'return1W', 'return3M', 'return6M', 'return1Y'
                ];

                const missingHeaders = requiredHeaders.filter(h => !header.includes(h));
                if (missingHeaders.length > 0) {
                    throw new Error(`Missing required CSV columns: ${missingHeaders.join(', ')}`);
                }
                
                const data: Stock[] = lines.slice(1).map((line, lineIndex) => {
                    const values = line.split(',');
                    const entry: Partial<Stock> = {};
                    header.forEach((key, index) => {
                        let value = values[index] ? values[index].trim() : null;
                        
                        if (['currentPrice', 'return1D', 'return1M', 'return1W', 'return3M', 'return6M', 'return1Y'].includes(key)) {
                             (entry as any)[key] = (value === null || value === '') ? null : parseFloat(value);
                        } else {
                             (entry as any)[key] = (value === null || value === '') ? null : value;
                        }
                    });
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
                        <li>Must be a valid CSV file.</li>
                        <li>Must contain the following header columns: <code>name, bseCode, nseCode, industry, currentPrice, return1D, return1M, return1W, return3M, return6M, return1Y</code></li>
                        <li>Numeric columns can be empty for N/A values.</li>
                    </ul>
                    <h3>What Happens After Upload</h3>
                    <ul>
                        <li>Your portfolio data will be updated in the app immediately.</li>
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


const PortfolioTable: React.FC<{ stocks: Stock[] }> = ({ stocks }) => {
    const industries = useMemo(() => ['All', ...Array.from(new Set(stocks.map(s => s.industry))).sort()], [stocks]);
    const [filters, setFilters] = useState({
        industry: 'All',
        min1YReturn: '',
        max1MReturn: '',
        searchTerm: '',
        minPrice: '',
        maxPrice: '',
    });
    
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [showFilterPopover, setShowFilterPopover] = useState(false);

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

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const filteredAndSortedStocks = useMemo(() => {
        let filtered = [...stocks];

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
    }, [filters, sortConfig, stocks]);
    
    const SortIndicator: React.FC<{ columnKey: SortKey }> = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return null;
        return <span className="sort-indicator">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>;
    };

    const ActiveFilters = () => {
        const activeFilters = [];
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

        if (activeFilters.length === 0) return null;
        
        const defaultValues = { industry: 'All', min1YReturn: '', max1MReturn: '', searchTerm: '', minPrice: '', maxPrice: '' };
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
                                {perfColumns.map(col => (
                                    visibleColumns[col.key] &&
                                    <td key={col.key} className="heatmap-td">
                                        <HeatmapCell value={stock[col.key] as number | null} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
};


const App: React.FC = () => {
    const [page, setPage] = useState<'table' | 'upload'>('table');
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadStocks = async () => {
            try {
                const response = await fetch('/service/portfolio');
                if (!response.ok) {
                    throw new Error('Failed to fetch portfolio data');
                }
                const portfolioData = await response.json();
                setStocks(portfolioData);
            } catch (error) {
                console.error('Error loading stock data:', error);
                // Fallback to empty array
                setStocks([]);
            } finally {
                setLoading(false);
            }
        };

        loadStocks();
    }, []);

    const handleDataUploaded = async (newData: Stock[]) => {
        try {
            // Update via Service
            const response = await fetch('/service/portfolio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: newData }),
            });

            if (!response.ok) {
                throw new Error('Failed to update portfolio data');
            }

            setStocks(newData);
            setTimeout(() => setPage('table'), 500);
        } catch (error) {
            console.error('Error updating portfolio data:', error);
            // Still update the UI even if Service fails
            setStocks(newData);
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
                <button className={page === 'upload' ? 'active' : ''} onClick={() => setPage('upload')}>Upload Data</button>
            </nav>
            <main>
                {page === 'table' && <PortfolioTable stocks={stocks} />}
                {page === 'upload' && <UploadPage onDataUploaded={handleDataUploaded} />}
            </main>
        </>
    );
}

export default App;