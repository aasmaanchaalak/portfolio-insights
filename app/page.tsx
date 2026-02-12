'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Stock, GridKeyData } from '../types';
import Dashboard from './components/Dashboard';

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

type TrendType = 'Strong Uptrend' | 'Uptrend' | 'Downtrend' | 'Strong Downtrend' | 'Neutral' | null;

const calculateTrend = (stock: Stock): TrendType => {
  // Check if we have enough data
  const returns = [stock.return1W, stock.return1M, stock.return3M, stock.return6M];
  const validReturns = returns.filter(r => r !== null && r !== undefined) as number[];

  if (validReturns.length < 2) return null;

  // Count positive and negative returns
  const positiveCount = validReturns.filter(r => r > 0).length;
  const negativeCount = validReturns.filter(r => r < 0).length;
  const avgReturn = validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

  // Strong trends require consistent direction across periods
  if (positiveCount >= 3 && avgReturn > 5) return 'Strong Uptrend';
  if (positiveCount >= 2 && avgReturn > 2) return 'Uptrend';
  if (negativeCount >= 3 && avgReturn < -5) return 'Strong Downtrend';
  if (negativeCount >= 2 && avgReturn < -2) return 'Downtrend';

  return 'Neutral';
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
    { key: 'bucket', label: 'Bucket' },
];

const TEAM_MEMBERS = ['Deepak', 'Aditya', 'Tushar', 'Aayush', 'Daksh', 'Siddhartha'];
const BUCKETS = ['Long Term', 'Short Term', 'Special Situation'];

const HeatmapCell: React.FC<{ value: number | null }> = ({ value }) => (
    <div
        className="heatmap-cell"
        style={{ backgroundColor: getPerfColor(value) }}
    >
        {formatValue(value, '%')}
    </div>
);

const Sparkline: React.FC<{ data: (number | null)[] }> = ({ data }) => {
    const width = 100;
    const height = 30;
    const strokeWidth = 1.5;

    // Filter out null/undefined values
    const validDataPoints = data
        .map((value, index) => ({ value, index }))
        .filter(d => d.value !== null && typeof d.value !== 'undefined');

    // Need at least 2 points to draw a line
    if (validDataPoints.length < 2) {
        return (
            <div className="sparkline-container" style={{ width, height, color: 'var(--secondary-text-color)' }}>
                N/A
            </div>
        );
    }

    const values = validDataPoints.map(d => d.value as number);

    // Calculate min/max for scaling
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min === 0 ? 1 : max - min;

    // Generate SVG points
    const points = validDataPoints.map(d => {
        // Map index to x coordinate
        const x = (d.index / (data.length - 1)) * (width - strokeWidth) + (strokeWidth / 2);

        // Map value to y coordinate (inverted because SVG y=0 is top)
        const y = (height - strokeWidth) - ((d.value! - min) / range) * (height - strokeWidth) + (strokeWidth / 2);

        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    // Determine color based on trend direction
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    let strokeColor = 'var(--secondary-text-color)';

    if (lastValue > firstValue) strokeColor = 'var(--positive-color-strong)';
    if (lastValue < firstValue) strokeColor = 'var(--negative-color-strong)';

    return (
        <div className="sparkline-container">
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
                <polyline
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    points={points}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    );
};


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
                    'Industry Group': 'industryGroup',
                    'Industry': 'industry',
                    'Current Price': 'currentPrice',
                    'Current Price (Rs)': 'currentPrice',
                    'Price to Earning': 'priceToEarning',
                    'PE': 'priceToEarning',
                    'P/E': 'priceToEarning',
                    'YOY Quarterly profit growth': 'yoyQuarterlyProfitGrowth',
                    'Quarterly profit growth YOY %': 'yoyQuarterlyProfitGrowth',
                    'YOY Quarterly sales growth': 'yoyQuarterlySalesGrowth',
                    'Quarterly sales growth YOY %': 'yoyQuarterlySalesGrowth',
                    'DMA 50': 'dma50',
                    '50 DMA': 'dma50',
                    '50-Day Moving Average': 'dma50',
                    'DMA 200': 'dma200',
                    '200 DMA': 'dma200',
                    '200-Day Moving Average': 'dma200',
                    'Down from 52w high': 'downFrom52WeekHigh',
                    'Down from 52 week high': 'downFrom52WeekHigh',
                    'Down from 52W high': 'downFrom52WeekHigh',
                    '52-Week High Distance (%)': 'downFrom52WeekHigh',
                    'Up from 52w low': 'upFrom52WeekLow',
                    'Up from 52 week low': 'upFrom52WeekLow',
                    'Up from 52W low': 'upFrom52WeekLow',
                    '52-Week Low Distance (%)': 'upFrom52WeekLow',
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
                    '1-Year Return (%)': 'return1Y',
                    // Market Cap
                    'Market Capitalization': 'marketCap',
                    'Market Cap': 'marketCap',
                    'Mcap': 'marketCap',
                    'Market cap': 'marketCap',
                    // RSI
                    'RSI': 'rsi',
                    'Rsi': 'rsi',
                    'Relative Strength Index': 'rsi',
                    // ROCE
                    'Return on capital employed': 'roce',
                    'ROCE': 'roce',
                    'ROCE %': 'roce',
                    'Return on Capital Employed': 'roce'
                };

                const requiredCsvHeaders = [
                    'Name', 'BSE Code', 'NSE Code', 'Industry Group', 'Industry',
                    'Current Price', 'Price to Earning',
                    'YOY Quarterly profit growth', 'YOY Quarterly sales growth',
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
                        const internalKey = columnMapping[csvColumn];
                        if (!internalKey) return;

                        let value = values[index] ? values[index].trim() : null;

                        if (['currentPrice', 'priceToEarning', 'yoyQuarterlyProfitGrowth', 'yoyQuarterlySalesGrowth', 'dma50', 'dma200', 'downFrom52WeekHigh', 'upFrom52WeekLow', 'return1D', 'return1M', 'return1W', 'return3M', 'return6M', 'return1Y', 'marketCap', 'rsi', 'roce'].includes(internalKey)) {
                             // Remove any commas from numbers (e.g., "1,234.56" -> "1234.56")
                             const cleanValue = value ? value.replace(/,/g, '') : null;
                             (entry as any)[internalKey] = (cleanValue === null || cleanValue === '') ? null : parseFloat(cleanValue);
                        } else {
                             (entry as any)[internalKey] = (value === null || value === '') ? null : value;
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
                <h1>Screener Data</h1>
                <p>Upload CSV file from Screener to update stock data.</p>
            </header>
            <div className="upload-content">
                <div className="upload-instructions">
                    <h3>File Requirements</h3>
                    <ul>
                        <li>Must be a valid CSV file exported from Screener.in</li>
                        <li>Required columns: <code>Name, BSE Code, NSE Code, Industry Group, Industry, Current Price, Price to Earning, YOY Quarterly profit growth, YOY Quarterly sales growth, Return over 1day, Return over 1week, Return over 1month, Return over 3months, Return over 6months, Return over 1year</code></li>
                        <li>Optional columns (for Trend & Momentum Dashboard): <code>DMA 50, DMA 200, Down from 52w high, Up from 52w low</code></li>
                        <li>Numeric columns can be empty for N/A values</li>
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

const GridKeyPage: React.FC<{ onGridKeyUploaded: (data: GridKeyData[], privateInvestments: { totalInvested: number; count: number }) => void }> = ({ onGridKeyUploaded }) => {
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
                const dataLines = lines.slice(1);

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
                            col === 'Avg Buy Price' ||
                            col.toLowerCase().includes('average') && col.toLowerCase().includes('buy') ||
                            col.toLowerCase().includes('avg') && col.toLowerCase().includes('buy')
                        );
                    }
                    return !header.includes(h);
                });

                if (missingHeaders.length > 0) {
                    setError(`Missing required columns: ${missingHeaders.join(', ')}`);
                    return;
                }

                const data: GridKeyData[] = dataLines.map(line => {
                    const values = parseCSVLine(line);
                    const scripName = values[header.indexOf('Asset name')] || '';
                    const bseCode = values[header.indexOf('Bse')] || null;
                    const nseCode = values[header.indexOf('Nse')] || null;

                    const quantityValue = values[header.findIndex(h => h === 'Quantity' || h === 'quantity' || h.toLowerCase().includes('quantity'))] || '0';
                    const quantity = parseFloat(quantityValue.replace(/,/g, '')) || 0;

                    const avgBuyPriceValue = values[header.findIndex(h =>
                        h === 'Average buy price' ||
                        h === 'Avg. buy price' ||
                        h === 'Average Buy Price' ||
                        h === 'Avg Buy Price' ||
                        (h.toLowerCase().includes('average') && h.toLowerCase().includes('buy')) ||
                        (h.toLowerCase().includes('avg') && h.toLowerCase().includes('buy'))
                    )] || '0';
                    const cleanAvgBuyPrice = avgBuyPriceValue.replace(/,/g, '');
                    const averageBuyPrice = cleanAvgBuyPrice ? parseFloat(cleanAvgBuyPrice) : null;

                    return {
                        scripName,
                        bseCode: bseCode && bseCode !== '' ? bseCode : null,
                        nseCode: nseCode && nseCode !== '' ? nseCode : null,
                        quantity,
                        averageBuyPrice
                    };
                });

                // Filter out stocks with no BSE or NSE code, and stocks with only 1 share
                const filtered = data.filter(item =>
                    (item.bseCode || item.nseCode) &&
                    item.quantity !== null &&
                    item.quantity > 1
                );

                // Calculate private investments (stocks without NSE/BSE codes)
                const privateStocks = data.filter(item =>
                    !item.bseCode && !item.nseCode &&
                    item.quantity !== null &&
                    item.quantity > 1
                );
                const privateInvestments = {
                    totalInvested: privateStocks.reduce((sum, item) =>
                        sum + ((item.quantity || 0) * (item.averageBuyPrice || 0)), 0),
                    count: privateStocks.length
                };

                onGridKeyUploaded(filtered, privateInvestments);
                setStatus(`GridKey data uploaded successfully! ${filtered.length} stocks processed${privateInvestments.count > 0 ? ` + ${privateInvestments.count} private investments` : ''} (1-share holdings excluded). View Portfolio View to see current amounts.`);
                setError('');
            } catch (err) {
                setError('Error parsing CSV file: ' + (err as Error).message);
            }
        };

        reader.readAsText(file);
    };

    return (
        <div className="upload-container">
            <header className="main-header">
                <h1>GridKey Data Upload</h1>
                <p>Upload your GridKey CSV file to add quantity and buy price data to your portfolio.</p>
            </header>

            <div className="upload-content">
                <div className="upload-instructions">
                    <h3>File Requirements</h3>
                    <ul>
                        <li>Must be a valid CSV file from GridKey</li>
                        <li>Required columns: <code>Scrip name, Quantity, Average buy price</code></li>
                        <li>Optional columns: <code>BSE Code, NSE Code</code></li>
                        <li>File should be exported directly from GridKey platform</li>
                    </ul>
                    <h3>What Happens After Upload</h3>
                    <ul>
                        <li>Your holdings data will be combined with stock data from Screener</li>
                        <li>Portfolio insights and analysis will become available</li>
                        <li>Data is automatically saved to the server</li>
                        <li>Current amounts will be calculated using live prices</li>
                    </ul>
                </div>

                <div className="upload-action-area">
                    <div className="filter-group">
                        <label htmlFor="file-upload">GridKey CSV File</label>
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

const PortfolioInsightsPage: React.FC<{ gridKeyData: GridKeyData[]; stocks: Stock[]; onStocksUpdate: (stocks: Stock[]) => void }> = ({ gridKeyData, stocks, onStocksUpdate }) => {
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({
        key: 'scripName',
        direction: 'ascending',
    });
    const [remarkValue, setRemarkValue] = useState<string>('');
    const [filters, setFilters] = useState({
        searchTerm: '',
        assignedTo: 'All',
        bucket: 'All',
        remarksSearch: '',
        trend: 'All',
    });
    const [rangeFilters, setRangeFilters] = useState({
        gainPercentageMin: '',
        gainPercentageMax: '',
        profitGrowthMin: '',
        profitGrowthMax: '',
        salesGrowthMin: '',
        salesGrowthMax: '',
        peMin: '',
        peMax: '',
        weightageMin: '',
        weightageMax: '',
    });
    const [showFilterPopover, setShowFilterPopover] = useState(false);
    const [remarksModalData, setRemarksModalData] = useState<any>(null);
    const [columnFilterOpen, setColumnFilterOpen] = useState<string | null>(null);

    const allInsightsColumns = [
        { key: 'quantity', label: 'Quantity' },
        { key: 'averageBuyPrice', label: 'Avg Buy Price' },
        { key: 'investedAmount', label: 'Invested Amount' },
        { key: 'currentPrice', label: 'Current Price' },
        { key: 'calculatedAmount', label: 'Current Amount' },
        { key: 'absoluteGain', label: 'Absolute Gain' },
        { key: 'gainPercentage', label: 'Gain %' },
        { key: 'weightage', label: 'Weightage %' },
        { key: 'portfolioContribution', label: 'Portfolio Contribution %' },
        { key: 'sparkline', label: 'Trend Chart' },
        { key: 'industryGroup', label: 'Industry Group' },
        { key: 'industry', label: 'Industry' },
        { key: 'priceToEarning', label: 'P/E' },
        { key: 'yoyQuarterlyProfitGrowth', label: 'Profit Growth %' },
        { key: 'yoyQuarterlySalesGrowth', label: 'Sales Growth %' },
        { key: 'dma50ChangePercent', label: 'Change% from DMA 50' },
        { key: 'dma200ChangePercent', label: 'Change% from DMA 200' },
        { key: 'downFrom52WeekHigh', label: 'Down from 52w High' },
        { key: 'upFrom52WeekLow', label: 'Up from 52w Low' },
        { key: 'trend', label: 'Trend' },
        { key: 'return1D', label: '1D %' },
        { key: 'return1W', label: '1W %' },
        { key: 'return1M', label: '1M %' },
        { key: 'return3M', label: '3M %' },
        { key: 'return6M', label: '6M %' },
        { key: 'return1Y', label: '1Y %' },
        { key: 'remarks', label: 'Remarks' },
        { key: 'assignedTo', label: 'Assigned To' },
        { key: 'bucket', label: 'Bucket' },
    ];

    const initialVisibleColumns = allInsightsColumns.reduce((acc, col) => {
        acc[col.key] = true;
        return acc;
    }, {} as Record<string, boolean>);

    // Load column preferences from localStorage
    const loadColumnPreferences = () => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('portfolioInsightsColumns');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    return initialVisibleColumns;
                }
            }
        }
        return initialVisibleColumns;
    };

    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(loadColumnPreferences);

    const toggleColumn = (key: string) => {
        setVisibleColumns(prev => {
            const updated = { ...prev, [key]: !prev[key] };
            // Save to localStorage
            if (typeof window !== 'undefined') {
                localStorage.setItem('portfolioInsightsColumns', JSON.stringify(updated));
            }
            return updated;
        });
    };

    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // Enrich GridKey data with all stock data from portfolio and calculate amounts
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
            const investedAmount = (item.quantity && item.averageBuyPrice) ? item.quantity * item.averageBuyPrice : null;
            const absoluteGain = (calculatedAmount !== null && investedAmount !== null) ? calculatedAmount - investedAmount : null;
            const gainPercentage = (investedAmount !== null && investedAmount !== 0 && absoluteGain !== null)
                ? (absoluteGain / investedAmount) * 100
                : null;
            const trend = matchedStock ? calculateTrend(matchedStock) : null;

            // Calculate sparkline data (synthetic historical trend)
            const todayValue = 100;
            const returnPeriods = [
                matchedStock?.return1Y,
                matchedStock?.return6M,
                matchedStock?.return3M,
                matchedStock?.return1M,
                matchedStock?.return1W,
                matchedStock?.return1D
            ];

            const historicalValues = returnPeriods.map(returnValue => {
                if (returnValue === null || returnValue === undefined) return null;
                const growthFactor = 1 + returnValue / 100;
                return growthFactor > 0 ? todayValue / growthFactor : null;
            });

            const sparklineData = [...historicalValues, todayValue];

            // Calculate DMA change percentages
            const dma50 = matchedStock?.dma50 || null;
            const dma200 = matchedStock?.dma200 || null;
            const dma50ChangePercent = (currentPrice !== null && dma50 !== null && dma50 !== 0)
                ? ((currentPrice - dma50) / dma50) * 100
                : null;
            const dma200ChangePercent = (currentPrice !== null && dma200 !== null && dma200 !== 0)
                ? ((currentPrice - dma200) / dma200) * 100
                : null;

            return {
                ...item,
                currentPrice,
                calculatedAmount,
                investedAmount,
                absoluteGain,
                gainPercentage,
                trend,
                sparklineData,
                // Add all portfolio fields
                industryGroup: matchedStock?.industryGroup || null,
                industry: matchedStock?.industry || null,
                priceToEarning: matchedStock?.priceToEarning || null,
                yoyQuarterlyProfitGrowth: matchedStock?.yoyQuarterlyProfitGrowth || null,
                yoyQuarterlySalesGrowth: matchedStock?.yoyQuarterlySalesGrowth || null,
                dma50: dma50,
                dma200: dma200,
                dma50ChangePercent: dma50ChangePercent,
                dma200ChangePercent: dma200ChangePercent,
                downFrom52WeekHigh: matchedStock?.downFrom52WeekHigh || null,
                upFrom52WeekLow: matchedStock?.upFrom52WeekLow || null,
                return1D: matchedStock?.return1D || null,
                return1W: matchedStock?.return1W || null,
                return1M: matchedStock?.return1M || null,
                return3M: matchedStock?.return3M || null,
                return6M: matchedStock?.return6M || null,
                return1Y: matchedStock?.return1Y || null,
                remarks: matchedStock?.remarks || null,
                assignedTo: matchedStock?.assignedTo || null,
                bucket: matchedStock?.bucket || null,
                entryDate: matchedStock?.entryDate || null,
                entryPrice: matchedStock?.entryPrice || null
            };
        });
    }, [gridKeyData, stocks]);

    // Calculate total and add weightage
    const totalCurrentAmount = useMemo(() => {
        return enrichedData.reduce((total, item) => total + ((item as any).calculatedAmount || 0), 0);
    }, [enrichedData]);

    const enrichedDataWithWeightage = useMemo(() => {
        return enrichedData.map(item => {
            const weightage = totalCurrentAmount > 0 && (item as any).calculatedAmount
                ? ((item as any).calculatedAmount / totalCurrentAmount) * 100
                : null;

            // Calculate portfolio contribution (YTD return * weightage) with fallback logic
            let ytdReturn: number | null = null;
            const matchedStock = stocks.find(stock => {
                if (item.nseCode && stock.nseCode) {
                    return item.nseCode.toLowerCase() === stock.nseCode.toLowerCase();
                }
                if (item.bseCode && stock.bseCode) {
                    return item.bseCode.toLowerCase() === stock.bseCode.toLowerCase();
                }
                return false;
            });

            if (matchedStock) {
                // Try 1Y first, then fallback to 6M, then 3M
                if (matchedStock.return1Y !== null && matchedStock.return1Y !== undefined) {
                    ytdReturn = matchedStock.return1Y;
                } else if (matchedStock.return6M !== null && matchedStock.return6M !== undefined) {
                    ytdReturn = matchedStock.return6M;
                } else if (matchedStock.return3M !== null && matchedStock.return3M !== undefined) {
                    ytdReturn = matchedStock.return3M;
                }
            }

            const portfolioContribution = (ytdReturn !== null && weightage !== null) 
                ? (ytdReturn * weightage) / 100 
                : null;

            return {
                ...item,
                weightage,
                portfolioContribution
            };
        });
    }, [enrichedData, totalCurrentAmount, stocks]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleRangeFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setRangeFilters(prev => ({ ...prev, [name]: value }));
    };


    const toggleColumnFilter = (columnKey: string) => {
        setColumnFilterOpen(prev => prev === columnKey ? null : columnKey);
    };

    const clearColumnFilter = (columnKey: string) => {
        const minKey = `${columnKey}Min` as keyof typeof rangeFilters;
        const maxKey = `${columnKey}Max` as keyof typeof rangeFilters;
        setRangeFilters(prev => ({
            ...prev,
            [minKey]: '',
            [maxKey]: ''
        }));
    };

    const hasColumnFilter = (columnKey: string): boolean => {
        const minKey = `${columnKey}Min` as keyof typeof rangeFilters;
        const maxKey = `${columnKey}Max` as keyof typeof rangeFilters;
        return rangeFilters[minKey] !== '' || rangeFilters[maxKey] !== '';
    };

    // Map column keys to range filter keys
    const getFilterKeys = (columnKey: string): { min: keyof typeof rangeFilters; max: keyof typeof rangeFilters} | null => {
        const mapping: Record<string, { min: keyof typeof rangeFilters; max: keyof typeof rangeFilters }> = {
            'gainPercentage': { min: 'gainPercentageMin', max: 'gainPercentageMax' },
            'yoyQuarterlyProfitGrowth': { min: 'profitGrowthMin', max: 'profitGrowthMax' },
            'yoyQuarterlySalesGrowth': { min: 'salesGrowthMin', max: 'salesGrowthMax' },
            'priceToEarning': { min: 'peMin', max: 'peMax' },
            'weightage': { min: 'weightageMin', max: 'weightageMax' },
        };
        return mapping[columnKey] || null;
    };

    const filteredAndSortedData = useMemo(() => {
        let filtered = [...enrichedDataWithWeightage];

        // Apply search filter
        if (filters.searchTerm) {
            filtered = filtered.filter(item =>
                item.scripName.toLowerCase().includes(filters.searchTerm.toLowerCase())
            );
        }

        // Apply assignment filter
        if (filters.assignedTo !== 'All') {
            if (filters.assignedTo === 'Unassigned') {
                filtered = filtered.filter(item => !(item as any).assignedTo);
            } else {
                filtered = filtered.filter(item => (item as any).assignedTo === filters.assignedTo);
            }
        }

        // Apply bucket filter
        if (filters.bucket !== 'All') {
            if (filters.bucket === 'Unassigned') {
                filtered = filtered.filter(item => !(item as any).bucket);
            } else {
                filtered = filtered.filter(item => (item as any).bucket === filters.bucket);
            }
        }

        // Apply remarks filter
        if (filters.remarksSearch) {
            filtered = filtered.filter(item =>
                (item as any).remarks && (item as any).remarks.toLowerCase().includes(filters.remarksSearch.toLowerCase())
            );
        }

        // Apply trend filter
        if (filters.trend !== 'All') {
            filtered = filtered.filter(item => (item as any).trend === filters.trend);
        }

        // Apply range filters
        filtered = filtered.filter(item => {
            const data = item as any;

            // Gain Percentage filter
            if (rangeFilters.gainPercentageMin !== '' && data.gainPercentage !== null) {
                if (data.gainPercentage < parseFloat(rangeFilters.gainPercentageMin)) return false;
            }
            if (rangeFilters.gainPercentageMax !== '' && data.gainPercentage !== null) {
                if (data.gainPercentage > parseFloat(rangeFilters.gainPercentageMax)) return false;
            }

            // Profit Growth filter
            if (rangeFilters.profitGrowthMin !== '' && data.yoyQuarterlyProfitGrowth !== null) {
                if (data.yoyQuarterlyProfitGrowth < parseFloat(rangeFilters.profitGrowthMin)) return false;
            }
            if (rangeFilters.profitGrowthMax !== '' && data.yoyQuarterlyProfitGrowth !== null) {
                if (data.yoyQuarterlyProfitGrowth > parseFloat(rangeFilters.profitGrowthMax)) return false;
            }

            // Sales Growth filter
            if (rangeFilters.salesGrowthMin !== '' && data.yoyQuarterlySalesGrowth !== null) {
                if (data.yoyQuarterlySalesGrowth < parseFloat(rangeFilters.salesGrowthMin)) return false;
            }
            if (rangeFilters.salesGrowthMax !== '' && data.yoyQuarterlySalesGrowth !== null) {
                if (data.yoyQuarterlySalesGrowth > parseFloat(rangeFilters.salesGrowthMax)) return false;
            }

            // P/E filter
            if (rangeFilters.peMin !== '' && data.priceToEarning !== null) {
                if (data.priceToEarning < parseFloat(rangeFilters.peMin)) return false;
            }
            if (rangeFilters.peMax !== '' && data.priceToEarning !== null) {
                if (data.priceToEarning > parseFloat(rangeFilters.peMax)) return false;
            }

            // Weightage filter
            if (rangeFilters.weightageMin !== '' && data.weightage !== null) {
                if (data.weightage < parseFloat(rangeFilters.weightageMin)) return false;
            }
            if (rangeFilters.weightageMax !== '' && data.weightage !== null) {
                if (data.weightage > parseFloat(rangeFilters.weightageMax)) return false;
            }

            return true;
        });

        // Sort
        filtered.sort((a, b) => {
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
        return filtered;
    }, [enrichedDataWithWeightage, sortConfig, filters, rangeFilters]);

    const SortIndicator: React.FC<{ columnKey: string }> = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) return null;
        return <span className="sort-indicator">{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>;
    };

    const ColumnFilterPopup: React.FC<{ columnKey: string }> = ({ columnKey }) => {
        const filterKeys = getFilterKeys(columnKey);
        if (!filterKeys) return null;

        return (
            <div className="column-filter-popup" onClick={(e) => e.stopPropagation()}>
                <div className="column-filter-content">
                    <div className="column-filter-header">
                        <span>Filter Range</span>
                        <button className="close-filter-btn" onClick={() => setColumnFilterOpen(null)}>×</button>
                    </div>
                    <div className="column-filter-inputs">
                        <input
                            type="number"
                            placeholder="Min"
                            name={filterKeys.min}
                            value={rangeFilters[filterKeys.min]}
                            onChange={handleRangeFilterChange}
                        />
                        <span>to</span>
                        <input
                            type="number"
                            placeholder="Max"
                            name={filterKeys.max}
                            value={rangeFilters[filterKeys.max]}
                            onChange={handleRangeFilterChange}
                        />
                    </div>
                    <div className="column-filter-actions">
                        <button className="clear-filter-btn" onClick={() => clearColumnFilter(columnKey)}>Clear</button>
                        <button className="apply-filter-btn" onClick={() => setColumnFilterOpen(null)}>Apply</button>
                    </div>
                </div>
            </div>
        );
    };

    const handleStockNameClick = (item: any) => {
        setRemarksModalData(item);
        setRemarkValue(item.remarks || '');
    };

    const handleCloseRemarksModal = () => {
        setRemarksModalData(null);
        setRemarkValue('');
    };

    const handleRemarkSave = async () => {
        if (!remarksModalData) return;

        const code = remarksModalData.nseCode || remarksModalData.bseCode;
        if (!code) return;

        try {
            const response = await fetch('/api/remarks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, remark: remarkValue })
            });

            if (response.ok) {
                // Find and update the matching stock
                const updatedStocks = stocks.map(s => {
                    if ((s.nseCode && s.nseCode === remarksModalData.nseCode) || (s.bseCode && s.bseCode === remarksModalData.bseCode)) {
                        return { ...s, remarks: remarkValue || null };
                    }
                    return s;
                });
                onStocksUpdate(updatedStocks);
                handleCloseRemarksModal();
            }
        } catch (error) {
            console.error('Error saving remark:', error);
        }
    };

    const handleAssignmentChange = async (item: any, assignedTo: string) => {
        const code = item.nseCode || item.bseCode;
        if (!code) return;

        try {
            const response = await fetch('/api/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, assignedTo: assignedTo || null })
            });

            if (response.ok) {
                // Find and update the matching stock
                const updatedStocks = stocks.map(s => {
                    if ((s.nseCode && s.nseCode === item.nseCode) || (s.bseCode && s.bseCode === item.bseCode)) {
                        return { ...s, assignedTo: assignedTo || null };
                    }
                    return s;
                });
                onStocksUpdate(updatedStocks);
            }
        } catch (error) {
            console.error('Error saving assignment:', error);
        }
    };

    const handleBucketChange = async (item: any, bucket: string) => {
        const code = item.nseCode || item.bseCode;
        if (!code) return;

        try {
            const response = await fetch('/api/buckets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, bucket: bucket || null })
            });

            if (response.ok) {
                // Find and update the matching stock
                const updatedStocks = stocks.map(s => {
                    if ((s.nseCode && s.nseCode === item.nseCode) || (s.bseCode && s.bseCode === item.bseCode)) {
                        return { ...s, bucket: bucket || null };
                    }
                    return s;
                });
                onStocksUpdate(updatedStocks);
            }
        } catch (error) {
            console.error('Error saving bucket:', error);
        }
    };

    // CSV export function for master data
    const exportToCSV = () => {
        // Define CSV headers
        const headers = [
            'Scrip Name',
            'NSE Code',
            'BSE Code',
            'Quantity',
            'Avg Buy Price',
            'Invested Amount',
            'Current Price',
            'Current Amount',
            'Absolute Gain',
            'Gain %',
            'Weightage %',
            'Portfolio Contribution %',
            'Industry Group',
            'Industry',
            'P/E',
            'Profit Growth %',
            'Sales Growth %',
            'DMA 50',
            'DMA 200',
            'Change % from DMA 50',
            'Change % from DMA 200',
            'Down from 52W High %',
            'Up from 52W Low %',
            'Trend',
            '1D %',
            '1W %',
            '1M %',
            '3M %',
            '6M %',
            '1Y %',
            'Remarks',
            'Assigned To',
            'Bucket',
        ];

        // Helper to escape CSV values
        const escapeCSV = (value: any): string => {
            if (value === null || value === undefined) return '';
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        // Helper to format numbers
        const formatNum = (value: number | null, decimals: number = 2): string => {
            if (value === null || value === undefined) return '';
            return value.toFixed(decimals);
        };

        // Build CSV rows from enrichedDataWithWeightage (full data, not filtered)
        const rows = enrichedDataWithWeightage.map((item: any) => [
            escapeCSV(item.scripName),
            escapeCSV(item.nseCode),
            escapeCSV(item.bseCode),
            item.quantity || '',
            formatNum(item.averageBuyPrice),
            formatNum(item.investedAmount),
            formatNum(item.currentPrice),
            formatNum(item.calculatedAmount),
            formatNum(item.absoluteGain),
            formatNum(item.gainPercentage),
            formatNum(item.weightage),
            formatNum(item.portfolioContribution),
            escapeCSV(item.industryGroup),
            escapeCSV(item.industry),
            formatNum(item.priceToEarning),
            formatNum(item.yoyQuarterlyProfitGrowth),
            formatNum(item.yoyQuarterlySalesGrowth),
            formatNum(item.dma50),
            formatNum(item.dma200),
            formatNum(item.dma50ChangePercent),
            formatNum(item.dma200ChangePercent),
            formatNum(item.downFrom52WeekHigh),
            formatNum(item.upFrom52WeekLow),
            escapeCSV(item.trend),
            formatNum(item.return1D),
            formatNum(item.return1W),
            formatNum(item.return1M),
            formatNum(item.return3M),
            formatNum(item.return6M),
            formatNum(item.return1Y),
            escapeCSV(item.remarks),
            escapeCSV(item.assignedTo),
            escapeCSV(item.bucket),
        ]);

        // Combine headers and rows
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Create and download blob
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const today = new Date().toISOString().split('T')[0];
        link.setAttribute('href', url);
        link.setAttribute('download', `portfolio_master_data_${today}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <header className="main-header">
                <h1>Portfolio Insights</h1>
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
                <>
                    <div className="action-bar">
                        <div className="search-bar">
                            <input
                                type="search"
                                name="searchTerm"
                                placeholder="Search by name..."
                                value={filters.searchTerm}
                                onChange={handleFilterChange}
                            />
                        </div>
                        <div className="action-buttons">
                            <button className="export-btn" onClick={exportToCSV}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                                    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                                </svg>
                                Export CSV
                            </button>
                            <button className="filter-btn" onClick={() => setShowFilterPopover(true)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1.5A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5z"/>
                                </svg>
                                Filters
                            </button>
                        </div>
                    </div>

                    {showFilterPopover && (
                        <div className="popover-backdrop" onClick={() => setShowFilterPopover(false)}>
                            <div className="popover-content" onClick={e => e.stopPropagation()}>
                                <div className="popover-header">
                                    <h3>Filter & View Options</h3>
                                    <button className="close-btn" onClick={() => setShowFilterPopover(false)}>×</button>
                                </div>
                                <div className="popover-body">
                                    <div className="filter-group">
                                        <label htmlFor="trend">Trend</label>
                                        <select id="trend" name="trend" value={filters.trend} onChange={handleFilterChange}>
                                            <option value="All">All Trends</option>
                                            <option value="Strong Uptrend">Strong Uptrend</option>
                                            <option value="Uptrend">Uptrend</option>
                                            <option value="Neutral">Neutral</option>
                                            <option value="Downtrend">Downtrend</option>
                                            <option value="Strong Downtrend">Strong Downtrend</option>
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
                                    <div className="filter-group">
                                        <label htmlFor="bucket">Bucket</label>
                                        <select id="bucket" name="bucket" value={filters.bucket} onChange={handleFilterChange}>
                                            <option value="All">All Buckets</option>
                                            <option value="Unassigned">Unassigned</option>
                                            {BUCKETS.map(bucket => <option key={bucket} value={bucket}>{bucket}</option>)}
                                        </select>
                                    </div>
                                    <div className="filter-group">
                                        <label htmlFor="remarksSearch">Search Remarks</label>
                                        <input
                                            type="text"
                                            id="remarksSearch"
                                            name="remarksSearch"
                                            placeholder="Search in remarks..."
                                            value={filters.remarksSearch}
                                            onChange={handleFilterChange}
                                        />
                                    </div>

                                    <div className="column-toggles-container">
                                        <label>Show/Hide Columns</label>
                                        <div className="column-toggles">
                                            {allInsightsColumns.map(col => (
                                                <div key={col.key} className="toggle-group">
                                                    <input
                                                        type="checkbox"
                                                        id={`toggle-${col.key}`}
                                                        checked={!!visibleColumns[col.key]}
                                                        onChange={() => toggleColumn(col.key)}
                                                    />
                                                    <label htmlFor={`toggle-${col.key}`}>{col.label}</label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="stock-table-container">
                    <table className="stock-table">
                        <thead>
                            <tr>
                                <th className="sticky-col" onClick={() => requestSort('scripName')}>
                                    <div className="th-content">
                                        <span>Stock Name <SortIndicator columnKey="scripName" /></span>
                                    </div>
                                </th>
                                {visibleColumns['quantity'] && <th className="text-right" onClick={() => requestSort('quantity')}>
                                    <div className="th-content">
                                        <span>Quantity <SortIndicator columnKey="quantity" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['averageBuyPrice'] && <th className="text-right avg-buy-price-col" onClick={() => requestSort('averageBuyPrice')}>
                                    <div className="th-content">
                                        <span>Avg Buy Price <SortIndicator columnKey="averageBuyPrice" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['investedAmount'] && <th className="text-right" onClick={() => requestSort('investedAmount')}>
                                    <div className="th-content">
                                        <span>Invested Amount <SortIndicator columnKey="investedAmount" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['currentPrice'] && <th className="text-right" onClick={() => requestSort('currentPrice')}>
                                    <div className="th-content">
                                        <span>Current Price <SortIndicator columnKey="currentPrice" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['calculatedAmount'] && <th className="text-right" onClick={() => requestSort('calculatedAmount')}>
                                    <div className="th-content">
                                        <span>Current Amount <SortIndicator columnKey="calculatedAmount" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['absoluteGain'] && <th className="text-right" onClick={() => requestSort('absoluteGain')}>
                                    <div className="th-content">
                                        <span>Absolute Gain <SortIndicator columnKey="absoluteGain" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['gainPercentage'] && <th className="text-right filterable-column">
                                    <div className="th-content">
                                        <span onClick={() => requestSort('gainPercentage')}>Gain % <SortIndicator columnKey="gainPercentage" /></span>
                                        <div className="filter-icon-wrapper">
                                            <button
                                                className={`filter-icon-btn ${hasColumnFilter('gainPercentage') ? 'active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleColumnFilter('gainPercentage');
                                                }}
                                            >
                                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                                    <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
                                                </svg>
                                            </button>
                                            {columnFilterOpen === 'gainPercentage' && <ColumnFilterPopup columnKey="gainPercentage" />}
                                        </div>
                                    </div>
                                </th>}
                                    {visibleColumns['weightage'] && <th className="text-right filterable-column">
                                    <div className="th-content">
                                        <span onClick={() => requestSort('weightage')}>Weightage % <SortIndicator columnKey="weightage" /></span>
                                        <div className="filter-icon-wrapper">
                                            <button
                                                className={`filter-icon-btn ${hasColumnFilter('weightage') ? 'active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleColumnFilter('weightage');
                                                }}
                                            >
                                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                                    <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
                                                </svg>
                                            </button>
                                            {columnFilterOpen === 'weightage' && <ColumnFilterPopup columnKey="weightage" />}
                                        </div>
                                    </div>
                                </th>}
                                {visibleColumns['portfolioContribution'] && <th className="text-right" onClick={() => requestSort('portfolioContribution')}>
                                    <div className="th-content">
                                        <span>Portfolio Contribution % <SortIndicator columnKey="portfolioContribution" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['sparkline'] && <th>
                                    <div className="th-content">
                                        <span>Trend Chart</span>
                                    </div>
                                </th>}
                                {visibleColumns['industryGroup'] && <th onClick={() => requestSort('industryGroup')}>
                                    <div className="th-content">
                                        <span>Industry Group <SortIndicator columnKey="industryGroup" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['industry'] && <th onClick={() => requestSort('industry')}>
                                    <div className="th-content">
                                        <span>Industry <SortIndicator columnKey="industry" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['priceToEarning'] && <th className="text-right filterable-column">
                                    <div className="th-content">
                                        <span onClick={() => requestSort('priceToEarning')}>P/E <SortIndicator columnKey="priceToEarning" /></span>
                                        <div className="filter-icon-wrapper">
                                            <button
                                                className={`filter-icon-btn ${hasColumnFilter('priceToEarning') ? 'active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleColumnFilter('priceToEarning');
                                                }}
                                            >
                                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                                    <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
                                                </svg>
                                            </button>
                                            {columnFilterOpen === 'priceToEarning' && <ColumnFilterPopup columnKey="priceToEarning" />}
                                        </div>
                                    </div>
                                </th>}
                                {visibleColumns['yoyQuarterlyProfitGrowth'] && <th className="text-right filterable-column">
                                    <div className="th-content">
                                        <span onClick={() => requestSort('yoyQuarterlyProfitGrowth')}>Profit Growth % <SortIndicator columnKey="yoyQuarterlyProfitGrowth" /></span>
                                        <div className="filter-icon-wrapper">
                                            <button
                                                className={`filter-icon-btn ${hasColumnFilter('yoyQuarterlyProfitGrowth') ? 'active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleColumnFilter('yoyQuarterlyProfitGrowth');
                                                }}
                                            >
                                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                                    <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
                                                </svg>
                                            </button>
                                            {columnFilterOpen === 'yoyQuarterlyProfitGrowth' && <ColumnFilterPopup columnKey="yoyQuarterlyProfitGrowth" />}
                                        </div>
                                    </div>
                                </th>}
                                {visibleColumns['yoyQuarterlySalesGrowth'] && <th className="text-right filterable-column">
                                    <div className="th-content">
                                        <span onClick={() => requestSort('yoyQuarterlySalesGrowth')}>Sales Growth % <SortIndicator columnKey="yoyQuarterlySalesGrowth" /></span>
                                        <div className="filter-icon-wrapper">
                                            <button
                                                className={`filter-icon-btn ${hasColumnFilter('yoyQuarterlySalesGrowth') ? 'active' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleColumnFilter('yoyQuarterlySalesGrowth');
                                                }}
                                            >
                                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                                    <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
                                                </svg>
                                            </button>
                                            {columnFilterOpen === 'yoyQuarterlySalesGrowth' && <ColumnFilterPopup columnKey="yoyQuarterlySalesGrowth" />}
                                        </div>
                                    </div>
                                </th>}
                                {visibleColumns['dma50ChangePercent'] && <th className="text-right" onClick={() => requestSort('dma50ChangePercent')}>
                                    <div className="th-content">
                                        <span>Change% from DMA 50 <SortIndicator columnKey="dma50ChangePercent" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['dma200ChangePercent'] && <th className="text-right" onClick={() => requestSort('dma200ChangePercent')}>
                                    <div className="th-content">
                                        <span>Change% from DMA 200 <SortIndicator columnKey="dma200ChangePercent" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['downFrom52WeekHigh'] && <th className="text-right" onClick={() => requestSort('downFrom52WeekHigh')}>
                                    <div className="th-content">
                                        <span>Down from 52w High <SortIndicator columnKey="downFrom52WeekHigh" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['upFrom52WeekLow'] && <th className="text-right" onClick={() => requestSort('upFrom52WeekLow')}>
                                    <div className="th-content">
                                        <span>Up from 52w Low <SortIndicator columnKey="upFrom52WeekLow" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['trend'] && <th onClick={() => requestSort('trend')}>
                                    <div className="th-content">
                                        <span>Trend <SortIndicator columnKey="trend" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['return1D'] && <th className="text-right" onClick={() => requestSort('return1D')}>
                                    <div className="th-content">
                                        <span>1D % <SortIndicator columnKey="return1D" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['return1W'] && <th className="text-right" onClick={() => requestSort('return1W')}>
                                    <div className="th-content">
                                        <span>1W % <SortIndicator columnKey="return1W" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['return1M'] && <th className="text-right" onClick={() => requestSort('return1M')}>
                                    <div className="th-content">
                                        <span>1M % <SortIndicator columnKey="return1M" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['return3M'] && <th className="text-right" onClick={() => requestSort('return3M')}>
                                    <div className="th-content">
                                        <span>3M % <SortIndicator columnKey="return3M" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['return6M'] && <th className="text-right" onClick={() => requestSort('return6M')}>
                                    <div className="th-content">
                                        <span>6M % <SortIndicator columnKey="return6M" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['return1Y'] && <th className="text-right" onClick={() => requestSort('return1Y')}>
                                    <div className="th-content">
                                        <span>1Y % <SortIndicator columnKey="return1Y" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['remarks'] && <th onClick={() => requestSort('remarks')}>
                                    <div className="th-content">
                                        <span>Remarks <SortIndicator columnKey="remarks" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['assignedTo'] && <th onClick={() => requestSort('assignedTo')}>
                                    <div className="th-content">
                                        <span>Assigned To <SortIndicator columnKey="assignedTo" /></span>
                                    </div>
                                </th>}
                                {visibleColumns['bucket'] && <th onClick={() => requestSort('bucket')}>
                                    <div className="th-content">
                                        <span>Bucket <SortIndicator columnKey="bucket" /></span>
                                    </div>
                                </th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedData.map((item, index) => (
                                <tr key={`${item.scripName}-${index}`}>
                                    <td className="stock-name-col sticky-col" title={item.scripName}>
                                        <span
                                            className="stock-name-clickable"
                                            onClick={() => handleStockNameClick(item)}
                                            title="Click to view/edit remarks"
                                        >
                                            {item.scripName}
                                        </span>
                                    </td>
                                    {visibleColumns['quantity'] && <td className="text-right">{item.quantity !== null && item.quantity !== undefined ? item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : 'N/A'}</td>}
                                    {visibleColumns['averageBuyPrice'] && <td className="text-right avg-buy-price-col">{item.averageBuyPrice !== null && item.averageBuyPrice !== undefined ? `₹${item.averageBuyPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A'}</td>}
                                    {visibleColumns['investedAmount'] && <td className="text-right">{(item as any).investedAmount !== null && (item as any).investedAmount !== undefined ? `₹${(item as any).investedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A'}</td>}
                                    {visibleColumns['currentPrice'] && <td className="text-right">{(item as any).currentPrice !== null && (item as any).currentPrice !== undefined ? `₹${(item as any).currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A'}</td>}
                                    {visibleColumns['calculatedAmount'] && <td className="text-right current-amount-cell">{(item as any).calculatedAmount !== null && (item as any).calculatedAmount !== undefined ? `₹${(item as any).calculatedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A'}</td>}
                                    {visibleColumns['absoluteGain'] && <td className="text-right" style={{ color: (item as any).absoluteGain !== null ? ((item as any).absoluteGain >= 0 ? 'var(--success-color)' : 'var(--error-color)') : 'inherit' }}>
                                        {(item as any).absoluteGain !== null && (item as any).absoluteGain !== undefined ? `₹${(item as any).absoluteGain.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A'}
                                    </td>}
                                    {visibleColumns['gainPercentage'] && <td className="text-right" style={{ color: (item as any).gainPercentage !== null ? ((item as any).gainPercentage >= 0 ? 'var(--success-color)' : 'var(--error-color)') : 'inherit', fontWeight: 500 }}>
                                        {(item as any).gainPercentage !== null && (item as any).gainPercentage !== undefined ? `${(item as any).gainPercentage.toFixed(2)}%` : 'N/A'}
                                    </td>}
                                    {visibleColumns['weightage'] && <td className="text-right weightage-cell">{(item as any).weightage !== null ? `${((item as any).weightage).toFixed(2)}%` : 'N/A'}</td>}
                                    {visibleColumns['portfolioContribution'] && <td className="text-right" style={{ color: (item as any).portfolioContribution !== null ? ((item as any).portfolioContribution >= 0 ? 'var(--success-color)' : 'var(--error-color)') : 'inherit', fontWeight: 500 }}>
                                        {(item as any).portfolioContribution !== null ? `${((item as any).portfolioContribution).toFixed(2)}%` : 'N/A'}
                                    </td>}
                                    {visibleColumns['sparkline'] && <td className="sparkline-td">
                                        <Sparkline data={(item as any).sparklineData || []} />
                                    </td>}
                                    {visibleColumns['industryGroup'] && <td>{(item as any).industryGroup || 'N/A'}</td>}
                                    {visibleColumns['industry'] && <td>{(item as any).industry || 'N/A'}</td>}
                                    {visibleColumns['priceToEarning'] && <td className="text-right">{(item as any).priceToEarning !== null && (item as any).priceToEarning !== undefined ? (item as any).priceToEarning.toFixed(2) : 'N/A'}</td>}
                                    {visibleColumns['yoyQuarterlyProfitGrowth'] && <td className="text-right" style={{ color: (item as any).yoyQuarterlyProfitGrowth !== null ? ((item as any).yoyQuarterlyProfitGrowth >= 0 ? 'var(--success-color)' : 'var(--error-color)') : 'inherit' }}>
                                        {(item as any).yoyQuarterlyProfitGrowth !== null && (item as any).yoyQuarterlyProfitGrowth !== undefined ? `${(item as any).yoyQuarterlyProfitGrowth.toFixed(2)}%` : 'N/A'}
                                    </td>}
                                    {visibleColumns['yoyQuarterlySalesGrowth'] && <td className="text-right" style={{ color: (item as any).yoyQuarterlySalesGrowth !== null ? ((item as any).yoyQuarterlySalesGrowth >= 0 ? 'var(--success-color)' : 'var(--error-color)') : 'inherit' }}>
                                        {(item as any).yoyQuarterlySalesGrowth !== null && (item as any).yoyQuarterlySalesGrowth !== undefined ? `${(item as any).yoyQuarterlySalesGrowth.toFixed(2)}%` : 'N/A'}
                                    </td>}
                                    {visibleColumns['dma50ChangePercent'] && <td className="text-right" style={{ color: (item as any).dma50ChangePercent !== null ? ((item as any).dma50ChangePercent >= 0 ? 'var(--success-color)' : 'var(--error-color)') : 'inherit' }}>
                                        {(item as any).dma50ChangePercent !== null && (item as any).dma50ChangePercent !== undefined ? `${(item as any).dma50ChangePercent.toFixed(2)}%` : 'N/A'}
                                    </td>}
                                    {visibleColumns['dma200ChangePercent'] && <td className="text-right" style={{ color: (item as any).dma200ChangePercent !== null ? ((item as any).dma200ChangePercent >= 0 ? 'var(--success-color)' : 'var(--error-color)') : 'inherit' }}>
                                        {(item as any).dma200ChangePercent !== null && (item as any).dma200ChangePercent !== undefined ? `${(item as any).dma200ChangePercent.toFixed(2)}%` : 'N/A'}
                                    </td>}
                                    {visibleColumns['downFrom52WeekHigh'] && <td className="text-right">
                                        {(item as any).downFrom52WeekHigh !== null && (item as any).downFrom52WeekHigh !== undefined ? `${(item as any).downFrom52WeekHigh.toFixed(2)}%` : 'N/A'}
                                    </td>}
                                    {visibleColumns['upFrom52WeekLow'] && <td className="text-right">
                                        {(item as any).upFrom52WeekLow !== null && (item as any).upFrom52WeekLow !== undefined ? `${(item as any).upFrom52WeekLow.toFixed(2)}%` : 'N/A'}
                                    </td>}
                                    {visibleColumns['trend'] && <td className="trend-cell">
                                        {(item as any).trend ? (
                                            <span className={`trend-badge trend-${(item as any).trend.toLowerCase().replace(/\s+/g, '-')}`}>
                                                {(item as any).trend}
                                            </span>
                                        ) : 'N/A'}
                                    </td>}
                                    {visibleColumns['return1D'] && <td className="heatmap-td"><HeatmapCell value={(item as any).return1D} /></td>}
                                    {visibleColumns['return1W'] && <td className="heatmap-td"><HeatmapCell value={(item as any).return1W} /></td>}
                                    {visibleColumns['return1M'] && <td className="heatmap-td"><HeatmapCell value={(item as any).return1M} /></td>}
                                    {visibleColumns['return3M'] && <td className="heatmap-td"><HeatmapCell value={(item as any).return3M} /></td>}
                                    {visibleColumns['return6M'] && <td className="heatmap-td"><HeatmapCell value={(item as any).return6M} /></td>}
                                    {visibleColumns['return1Y'] && <td className="heatmap-td"><HeatmapCell value={(item as any).return1Y} /></td>}
                                    {visibleColumns['remarks'] && <td className="remarks-cell">
                                        {(item as any).remarks || '-'}
                                    </td>}
                                    {visibleColumns['assignedTo'] && <td className="assignment-cell">
                                        <select
                                            value={(item as any).assignedTo || ''}
                                            onChange={(e) => handleAssignmentChange(item, e.target.value)}
                                            className="assignment-select"
                                        >
                                            <option value="">Unassigned</option>
                                            {TEAM_MEMBERS.map(member => (
                                                <option key={member} value={member}>{member}</option>
                                            ))}
                                        </select>
                                    </td>}
                                    {visibleColumns['bucket'] && <td className="assignment-cell">
                                        <select
                                            value={(item as any).bucket || ''}
                                            onChange={(e) => handleBucketChange(item, e.target.value)}
                                            className="assignment-select"
                                        >
                                            <option value="">Unassigned</option>
                                            {BUCKETS.map(bucket => (
                                                <option key={bucket} value={bucket}>{bucket}</option>
                                            ))}
                                        </select>
                                    </td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                </>
            )}

            {remarksModalData && (
                <div className="remarks-modal-backdrop" onClick={handleCloseRemarksModal}>
                    <div className="remarks-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="remarks-modal-header">
                            <h3>{remarksModalData.scripName}</h3>
                            <button className="close-btn" onClick={handleCloseRemarksModal}>×</button>
                        </div>
                        <div className="remarks-modal-body">
                            <div className="stock-info">
                                <div className="stock-info-row">
                                    <span className="label">NSE Code:</span>
                                    <span className="value">{remarksModalData.nseCode || 'N/A'}</span>
                                </div>
                                <div className="stock-info-row">
                                    <span className="label">BSE Code:</span>
                                    <span className="value">{remarksModalData.bseCode || 'N/A'}</span>
                                </div>
                                <div className="stock-info-row">
                                    <span className="label">Current Price:</span>
                                    <span className="value">
                                        {remarksModalData.currentPrice !== null ? `₹${remarksModalData.currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A'}
                                    </span>
                                </div>
                                {remarksModalData.nseCode || remarksModalData.bseCode ? (
                                    <div className="stock-info-row">
                                        <a
                                            href={`https://www.screener.in/company/${remarksModalData.nseCode || remarksModalData.bseCode}/`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="screener-link"
                                        >
                                            View on Screener.in →
                                        </a>
                                    </div>
                                ) : null}
                            </div>
                            <div className="remarks-section">
                                <label htmlFor="remarks-textarea">Remarks</label>
                                <textarea
                                    id="remarks-textarea"
                                    value={remarkValue}
                                    onChange={(e) => setRemarkValue(e.target.value)}
                                    placeholder="Add your remarks here..."
                                    rows={6}
                                />
                            </div>
                        </div>
                        <div className="remarks-modal-footer">
                            <button className="cancel-modal-btn" onClick={handleCloseRemarksModal}>Cancel</button>
                            <button className="save-modal-btn" onClick={handleRemarkSave}>Save Remarks</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};


const AnalysisPage: React.FC<{ gridKeyData: GridKeyData[]; stocks: Stock[] }> = ({ gridKeyData, stocks }) => {
    const [selectedChart, setSelectedChart] = useState<'allocation' | 'performance' | 'growth' | 'sectors' | 'rotation' | 'value'>('allocation');
    const [portfolioHistory, setPortfolioHistory] = useState<{date: string; value: number; timestamp: number}[]>([]);

    // Load portfolio history
    useEffect(() => {
        const loadHistory = async () => {
            try {
                const response = await fetch('/api/portfolio-history');
                if (response.ok) {
                    const data = await response.json();
                    setPortfolioHistory(data);
                }
            } catch (error) {
                console.error('Error loading portfolio history:', error);
            }
        };
        loadHistory();
    }, []);

    // Enrich gridKey data with stock information
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
            const investedAmount = (item.quantity && item.averageBuyPrice) ? item.quantity * item.averageBuyPrice : null;
            const absoluteGain = (calculatedAmount !== null && investedAmount !== null) ? calculatedAmount - investedAmount : null;
            const gainPercentage = (investedAmount !== null && investedAmount !== 0 && absoluteGain !== null)
                ? (absoluteGain / investedAmount) * 100
                : null;
            return {
                ...item,
                currentPrice,
                calculatedAmount,
                investedAmount,
                absoluteGain,
                gainPercentage,
                industryGroup: matchedStock?.industryGroup || null,
                industry: matchedStock?.industry || null,
                priceToEarning: matchedStock?.priceToEarning || null,
                yoyQuarterlyProfitGrowth: matchedStock?.yoyQuarterlyProfitGrowth || null,
                yoyQuarterlySalesGrowth: matchedStock?.yoyQuarterlySalesGrowth || null,
            };
        });
    }, [gridKeyData, stocks]);

    const totalCurrentAmount = useMemo(() => {
        return enrichedData.reduce((total, item) => total + ((item as any).calculatedAmount || 0), 0);
    }, [enrichedData]);

    // Portfolio Allocation Chart (Pie/Bar Chart)
    const AllocationChart = () => {
        const [showAll, setShowAll] = useState(false);

        const allStocks = enrichedData
            .map(item => ({
                name: item.scripName,
                value: (item as any).calculatedAmount || 0,
                percentage: totalCurrentAmount > 0 ? (((item as any).calculatedAmount || 0) / totalCurrentAmount) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);

        const displayStocks = showAll ? allStocks : allStocks.slice(0, 10);
        const maxValue = Math.max(...allStocks.map(d => d.value));

        return (
            <div className="chart-card">
                <h3>Holdings by Value {showAll ? `(All ${allStocks.length} Stocks)` : '(Top 10)'}</h3>
                <div className="bar-chart">
                    {displayStocks.map((item, index) => (
                        <div key={index} className="bar-item">
                            <div className="bar-label">{item.name}</div>
                            <div className="bar-container">
                                <div
                                    className="bar-fill"
                                    style={{
                                        width: `${(item.value / maxValue) * 100}%`,
                                        backgroundColor: `hsl(${210 - (index % 12) * 20}, 70%, 50%)`
                                    }}
                                >
                                    <span className="bar-value">₹{item.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({item.percentage.toFixed(1)}%)</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                {allStocks.length > 10 && (
                    <div className="chart-actions">
                        <button 
                            className="show-more-btn"
                            onClick={() => setShowAll(!showAll)}
                        >
                            {showAll ? 'Show Less' : `Show All ${allStocks.length} Stocks`}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    // Performance Distribution Chart
    const PerformanceChart = () => {
        const [performanceMode, setPerformanceMode] = useState<'alltime' | '1year'>('alltime');

        const ranges = [
            { label: '< -20%', min: -Infinity, max: -20, count: 0 },
            { label: '-20% to -10%', min: -20, max: -10, count: 0 },
            { label: '-10% to 0%', min: -10, max: 0, count: 0 },
            { label: '0% to 10%', min: 0, max: 10, count: 0 },
            { label: '10% to 20%', min: 10, max: 20, count: 0 },
            { label: '20% to 50%', min: 20, max: 50, count: 0 },
            { label: '> 50%', min: 50, max: Infinity, count: 0 },
        ];

        // Function to get the best available return for 1Y mode with fallback
        const getBestReturn = (item: any) => {
            if (performanceMode === 'alltime') {
                return item.gainPercentage;
            }
            
            // For 1Y mode, use fallback: 1Y -> 6M -> 3M
            const matchedStock = stocks.find(stock => {
                if (item.nseCode && stock.nseCode) {
                    return item.nseCode.toLowerCase() === stock.nseCode.toLowerCase();
                }
                if (item.bseCode && stock.bseCode) {
                    return item.bseCode.toLowerCase() === stock.bseCode.toLowerCase();
                }
                return false;
            });

            if (!matchedStock) return null;

            // Try 1Y first, then fallback to 6M, then 3M
            if (matchedStock.return1Y !== null && matchedStock.return1Y !== undefined) {
                return matchedStock.return1Y;
            }
            if (matchedStock.return6M !== null && matchedStock.return6M !== undefined) {
                return matchedStock.return6M;
            }
            if (matchedStock.return3M !== null && matchedStock.return3M !== undefined) {
                return matchedStock.return3M;
            }
            return null;
        };

        enrichedData.forEach(item => {
            const gain = getBestReturn(item);
            if (gain !== null && gain !== undefined) {
                const range = ranges.find(r => gain >= r.min && gain < r.max);
                if (range) range.count++;
            }
        });

        const maxCount = Math.max(...ranges.map(r => r.count));

        return (
            <div className="chart-card">
                <div className="chart-header">
                    <div>
                        <h3>Gain/Loss Distribution</h3>
                        <p className="chart-subtitle">
                            {performanceMode === 'alltime' ? 'Total returns since purchase' : 'Returns over 1 year period (with fallbacks)'}
                        </p>
                    </div>
                    <div className="performance-toggle">
                        <button 
                            className={`performance-btn ${performanceMode === 'alltime' ? 'active' : ''}`}
                            onClick={() => setPerformanceMode('alltime')}
                        >
                            All-time
                        </button>
                        <button 
                            className={`performance-btn ${performanceMode === '1year' ? 'active' : ''}`}
                            onClick={() => setPerformanceMode('1year')}
                        >
                            1Y
                        </button>
                    </div>
                </div>
                <div className="bar-chart">
                    {ranges.map((range, index) => (
                        <div key={index} className="bar-item">
                            <div className="bar-label">{range.label}</div>
                            <div className="bar-container">
                                <div
                                    className="bar-fill"
                                    style={{
                                        width: maxCount > 0 ? `${(range.count / maxCount) * 100}%` : '0%',
                                        backgroundColor: range.min < 0 ? 'var(--error-color)' : 'var(--success-color)'
                                    }}
                                >
                                    <span className="bar-value">{range.count} stocks</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Growth Metrics Chart
    const GrowthChart = () => {
        const stocksWithGrowth = enrichedData
            .filter(item => {
                const profit = (item as any).yoyQuarterlyProfitGrowth;
                const sales = (item as any).yoyQuarterlySalesGrowth;
                return profit !== null || sales !== null;
            })
            .map(item => ({
                name: item.scripName,
                profitGrowth: (item as any).yoyQuarterlyProfitGrowth || 0,
                salesGrowth: (item as any).yoyQuarterlySalesGrowth || 0
            }))
            .sort((a, b) => b.profitGrowth - a.profitGrowth)
            .slice(0, 10);

        return (
            <div className="chart-card">
                <h3>Top 10 Stocks by Profit Growth</h3>
                <div className="scatter-chart">
                    <div className="scatter-axis-label-y">Sales Growth %</div>
                    <svg width="100%" height="400" viewBox="0 0 600 400">
                        {/* Grid lines */}
                        {[-20, 0, 20, 40, 60].map(y => (
                            <line key={`h-${y}`} x1="50" x2="580" y1={350 - (y + 30) * 3} y2={350 - (y + 30) * 3} stroke="var(--border-color)" strokeWidth="1" />
                        ))}
                        {[-20, 0, 20, 40, 60].map(x => (
                            <line key={`v-${x}`} x1={50 + (x + 30) * 5.5} x2={50 + (x + 30) * 5.5} y1="20" y2="350" stroke="var(--border-color)" strokeWidth="1" />
                        ))}

                        {/* Axis labels */}
                        <line x1="50" x2="580" y1="350" y2="350" stroke="var(--primary-text-color)" strokeWidth="2" />
                        <line x1="50" x2="50" y1="20" y2="350" stroke="var(--primary-text-color)" strokeWidth="2" />

                        {/* Data points */}
                        {stocksWithGrowth.map((stock, index) => {
                            const x = 50 + Math.max(-30, Math.min(60, stock.profitGrowth)) * 5.5 + 165;
                            const y = 350 - (Math.max(-30, Math.min(60, stock.salesGrowth)) * 3 + 90);
                            return (
                                <g key={index}>
                                    <circle
                                        cx={x}
                                        cy={y}
                                        r="6"
                                        fill={`hsl(${120 - index * 12}, 70%, 50%)`}
                                        opacity="0.7"
                                    />
                                    <title>{stock.name}: Profit {stock.profitGrowth.toFixed(1)}%, Sales {stock.salesGrowth.toFixed(1)}%</title>
                                </g>
                            );
                        })}

                        {/* Axis numbers */}
                        <text x="40" y="355" fontSize="12" fill="var(--secondary-text-color)" textAnchor="end">-20</text>
                        <text x="40" y="265" fontSize="12" fill="var(--secondary-text-color)" textAnchor="end">0</text>
                        <text x="40" y="175" fontSize="12" fill="var(--secondary-text-color)" textAnchor="end">20</text>
                        <text x="40" y="85" fontSize="12" fill="var(--secondary-text-color)" textAnchor="end">40</text>

                        <text x="50" y="370" fontSize="12" fill="var(--secondary-text-color)" textAnchor="middle">-20</text>
                        <text x="215" y="370" fontSize="12" fill="var(--secondary-text-color)" textAnchor="middle">0</text>
                        <text x="380" y="370" fontSize="12" fill="var(--secondary-text-color)" textAnchor="middle">20</text>
                        <text x="545" y="370" fontSize="12" fill="var(--secondary-text-color)" textAnchor="middle">40</text>
                    </svg>
                    <div className="scatter-axis-label-x">Profit Growth %</div>
                </div>
            </div>
        );
    };

    // Sector Distribution
    const SectorChart = () => {
        const sectorMap: Record<string, number> = {};
        enrichedData.forEach(item => {
            const sector = (item as any).industryGroup || 'Unknown';
            const value = (item as any).calculatedAmount || 0;
            sectorMap[sector] = (sectorMap[sector] || 0) + value;
        });

        const sectors = Object.entries(sectorMap)
            .map(([name, value]) => ({
                name,
                value,
                percentage: totalCurrentAmount > 0 ? (value / totalCurrentAmount) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        const maxValue = Math.max(...sectors.map(s => s.value));

        return (
            <div className="chart-card">
                <h3>Sector Allocation</h3>
                <div className="bar-chart">
                    {sectors.map((sector, index) => (
                        <div key={index} className="bar-item">
                            <div className="bar-label">{sector.name}</div>
                            <div className="bar-container">
                                <div
                                    className="bar-fill"
                                    style={{
                                        width: `${(sector.value / maxValue) * 100}%`,
                                        backgroundColor: `hsl(${index * 45}, 65%, 55%)`
                                    }}
                                >
                                    <span className="bar-value">₹{sector.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({sector.percentage.toFixed(1)}%)</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Sector Rotation View
    const SectorRotationView = () => {
        // Calculate industry-level metrics by matching stocks with enriched data
        const industryMetrics: Record<string, {
            count: number;
            return1M: number[];
            return3M: number[];
            return6M: number[];
            pe: number[];
            allocations: number[];
            peWeightedSum: number;
            totalAllocation: number;
        }> = {};

        enrichedData.forEach(item => {
            const matchedStock = stocks.find(stock => {
                if (item.nseCode && stock.nseCode) {
                    return item.nseCode.toLowerCase() === stock.nseCode.toLowerCase();
                }
                if (item.bseCode && stock.bseCode) {
                    return item.bseCode.toLowerCase() === stock.bseCode.toLowerCase();
                }
                return false;
            });

            if (!matchedStock) return;

            const industry = matchedStock.industry || 'Unknown';
            const allocation = (item as any).calculatedAmount || 0;

            if (!industryMetrics[industry]) {
                industryMetrics[industry] = {
                    count: 0,
                    return1M: [],
                    return3M: [],
                    return6M: [],
                    pe: [],
                    allocations: [],
                    peWeightedSum: 0,
                    totalAllocation: 0
                };
            }

            industryMetrics[industry].count++;
            industryMetrics[industry].totalAllocation += allocation;

            if (matchedStock.return1M !== null) industryMetrics[industry].return1M.push(matchedStock.return1M);
            if (matchedStock.return3M !== null) industryMetrics[industry].return3M.push(matchedStock.return3M);
            if (matchedStock.return6M !== null) industryMetrics[industry].return6M.push(matchedStock.return6M);

            if (matchedStock.priceToEarning !== null && allocation > 0) {
                industryMetrics[industry].pe.push(matchedStock.priceToEarning);
                industryMetrics[industry].peWeightedSum += matchedStock.priceToEarning * allocation;
            }
        });

        // Calculate averages
        const industryData = Object.entries(industryMetrics)
            .map(([industry, metrics]) => {
                const avgReturn1M = metrics.return1M.length > 0
                    ? metrics.return1M.reduce((sum, val) => sum + val, 0) / metrics.return1M.length
                    : null;
                const avgReturn3M = metrics.return3M.length > 0
                    ? metrics.return3M.reduce((sum, val) => sum + val, 0) / metrics.return3M.length
                    : null;
                const avgReturn6M = metrics.return6M.length > 0
                    ? metrics.return6M.reduce((sum, val) => sum + val, 0) / metrics.return6M.length
                    : null;

                // Weighted average P/E by allocation
                const avgPE = metrics.totalAllocation > 0 && metrics.peWeightedSum > 0
                    ? metrics.peWeightedSum / metrics.totalAllocation
                    : null;

                return {
                    industry,
                    avgReturn1M,
                    avgReturn3M,
                    avgReturn6M,
                    avgPE,
                    count: metrics.count,
                    allocation: metrics.totalAllocation
                };
            })
            .filter(d => d.avgReturn1M !== null && d.avgReturn6M !== null);

        // Sector Rotation Curve
        const RotationCurve = () => {
            if (industryData.length === 0) {
                return (
                    <div className="chart-card">
                        <h3>Sector Rotation Curve</h3>
                        <p className="chart-subtitle">1-Month vs 6-Month returns by industry</p>
                        <div className="empty-chart-state">
                            <p>No data available with both 1-month and 6-month returns.</p>
                        </div>
                    </div>
                );
            }

            const svgWidth = 700;
            const svgHeight = 400;
            const padding = 60;
            const chartWidth = svgWidth - 2 * padding;
            const chartHeight = svgHeight - 2 * padding;

            const allReturns1M = industryData.map(d => d.avgReturn1M!);
            const allReturns6M = industryData.map(d => d.avgReturn6M!);

            const minX = Math.min(...allReturns6M, 0);
            const maxX = Math.max(...allReturns6M, 0);
            const minY = Math.min(...allReturns1M, 0);
            const maxY = Math.max(...allReturns1M, 0);

            const xRange = maxX - minX;
            const yRange = maxY - minY;

            const scaleX = (val: number) => padding + ((val - minX) / xRange) * chartWidth;
            const scaleY = (val: number) => svgHeight - padding - ((val - minY) / yRange) * chartHeight;

            // Create path through all points
            const pathPoints = industryData.map((d, i) => {
                const x = scaleX(d.avgReturn6M!);
                const y = scaleY(d.avgReturn1M!);
                return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
            }).join(' ');

            return (
                <div className="chart-card rotation-curve-card">
                    <h3>Sector Rotation Curve</h3>
                    <p className="chart-subtitle">Identifies sectors heating up (top-right) vs cooling down (bottom-left)</p>
                    <div className="rotation-curve-container">
                        <svg width={svgWidth} height={svgHeight} className="rotation-curve-svg">
                            {/* Grid lines */}
                            <line x1={padding} y1={scaleY(0)} x2={svgWidth - padding} y2={scaleY(0)} stroke="var(--border-color)" strokeWidth="1" />
                            <line x1={scaleX(0)} y1={padding} x2={scaleX(0)} y2={svgHeight - padding} stroke="var(--border-color)" strokeWidth="1" />

                            {/* Quadrant labels */}
                            <text x={svgWidth - padding - 80} y={padding + 20} fontSize="11" fill="var(--secondary-text-color)" fontStyle="italic">
                                Heating Up
                            </text>
                            <text x={padding + 10} y={svgHeight - padding - 10} fontSize="11" fill="var(--secondary-text-color)" fontStyle="italic">
                                Cooling Down
                            </text>

                            {/* Connecting line */}
                            <path d={pathPoints} stroke="var(--accent-color)" strokeWidth="2" fill="none" opacity="0.3" />

                            {/* Plot points */}
                            {industryData.map((d, i) => {
                                const x = scaleX(d.avgReturn6M!);
                                const y = scaleY(d.avgReturn1M!);
                                const color = d.avgReturn1M! > d.avgReturn6M! ? 'var(--success-color)' : 'var(--error-color)';

                                return (
                                    <g key={i}>
                                        <circle cx={x} cy={y} r="6" fill={color} opacity="0.8" />
                                        <text x={x + 10} y={y + 4} fontSize="10" fill="var(--text-color)">
                                            {d.industry.length > 15 ? d.industry.substring(0, 15) + '...' : d.industry}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Axes labels */}
                            <text x={svgWidth / 2} y={svgHeight - 10} fontSize="12" fill="var(--text-color)" textAnchor="middle" fontWeight="600">
                                6-Month Return (%)
                            </text>
                            <text x={20} y={svgHeight / 2} fontSize="12" fill="var(--text-color)" textAnchor="middle" transform={`rotate(-90 20 ${svgHeight / 2})`} fontWeight="600">
                                1-Month Return (%)
                            </text>

                            {/* Axis tick labels */}
                            <text x={scaleX(minX)} y={svgHeight - padding + 20} fontSize="10" fill="var(--secondary-text-color)" textAnchor="middle">
                                {minX.toFixed(1)}
                            </text>
                            <text x={scaleX(0)} y={svgHeight - padding + 20} fontSize="10" fill="var(--secondary-text-color)" textAnchor="middle">
                                0
                            </text>
                            <text x={scaleX(maxX)} y={svgHeight - padding + 20} fontSize="10" fill="var(--secondary-text-color)" textAnchor="middle">
                                {maxX.toFixed(1)}
                            </text>

                            <text x={padding - 10} y={scaleY(minY)} fontSize="10" fill="var(--secondary-text-color)" textAnchor="end">
                                {minY.toFixed(1)}
                            </text>
                            <text x={padding - 10} y={scaleY(0)} fontSize="10" fill="var(--secondary-text-color)" textAnchor="end">
                                0
                            </text>
                            <text x={padding - 10} y={scaleY(maxY)} fontSize="10" fill="var(--secondary-text-color)" textAnchor="end">
                                {maxY.toFixed(1)}
                            </text>
                        </svg>
                        <div className="rotation-legend">
                            <div className="legend-item">
                                <span className="legend-color" style={{ backgroundColor: 'var(--success-color)' }}></span>
                                <span>Accelerating (1M &gt; 6M)</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color" style={{ backgroundColor: 'var(--error-color)' }}></span>
                                <span>Decelerating (1M &lt; 6M)</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        // Industry Valuation Heatmap
        const ValuationHeatmap = () => {
            const industriesWithPE = industryData.filter(d => d.avgPE !== null);

            if (industriesWithPE.length === 0) {
                return (
                    <div className="chart-card">
                        <h3>Industry Valuation Heatmap</h3>
                        <p className="chart-subtitle">Average P/E ratio by industry</p>
                        <div className="empty-chart-state">
                            <p>No P/E data available for industries.</p>
                        </div>
                    </div>
                );
            }

            const sortedIndustries = [...industriesWithPE].sort((a, b) => (b.avgPE! - a.avgPE!));

            // Calculate portfolio-weighted average P/E
            const totalPortfolioAllocation = industriesWithPE.reduce((sum, d) => sum + d.allocation, 0);
            const portfolioWeightedPE = totalPortfolioAllocation > 0
                ? industriesWithPE.reduce((sum, d) => sum + (d.avgPE! * d.allocation), 0) / totalPortfolioAllocation
                : industriesWithPE.reduce((sum, d) => sum + d.avgPE!, 0) / industriesWithPE.length;

            const maxPE = Math.max(...industriesWithPE.map(d => d.avgPE!));

            return (
                <div className="chart-card valuation-heatmap-card">
                    <h3>Industry Valuation Heatmap</h3>
                    <p className="chart-subtitle">P/E comparison - identify overvalued vs undervalued sectors</p>
                    <div className="valuation-heatmap">
                        <div className="heatmap-info">
                            <span><strong>Portfolio Avg P/E:</strong> {portfolioWeightedPE.toFixed(2)}</span>
                        </div>
                        <table className="heatmap-table">
                            <thead>
                                <tr>
                                    <th>Industry</th>
                                    <th>Stocks</th>
                                    <th>Avg P/E</th>
                                    <th>vs Portfolio</th>
                                    <th>Valuation Signal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedIndustries.map((d, index) => {
                                    const vsPortfolio = ((d.avgPE! - portfolioWeightedPE) / portfolioWeightedPE) * 100;
                                    const isExpensive = d.avgPE! > portfolioWeightedPE * 1.2;
                                    const isCheap = d.avgPE! < portfolioWeightedPE * 0.8;

                                    let peColor = '#FFA500'; // Neutral
                                    let intensity = 0.3;

                                    if (isExpensive) {
                                        peColor = '#FF6B6B';
                                        intensity = Math.min(0.9, 0.3 + (d.avgPE! - portfolioWeightedPE) / maxPE);
                                    } else if (isCheap) {
                                        peColor = '#51CF66';
                                        intensity = Math.min(0.9, 0.3 + (portfolioWeightedPE - d.avgPE!) / portfolioWeightedPE);
                                    }

                                    return (
                                        <tr key={index}>
                                            <td className="industry-name-cell">{d.industry}</td>
                                            <td className="text-center">{d.count}</td>
                                            <td className="text-center pe-cell" style={{ backgroundColor: peColor, opacity: intensity, fontWeight: 600 }}>
                                                {d.avgPE!.toFixed(2)}
                                            </td>
                                            <td className="text-center" style={{ color: vsPortfolio >= 0 ? 'var(--error-color)' : 'var(--success-color)', fontWeight: 600 }}>
                                                {vsPortfolio >= 0 ? '+' : ''}{vsPortfolio.toFixed(1)}%
                                            </td>
                                            <td className="text-center">
                                                {isExpensive && <span className="valuation-badge expensive">Expensive</span>}
                                                {isCheap && <span className="valuation-badge cheap">Cheap</span>}
                                                {!isExpensive && !isCheap && <span className="valuation-badge neutral">Fair</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div className="heatmap-legend">
                            <p><strong>Decision Utility:</strong> High 1M returns + Low P/E = Money rotating into undervalued sector (opportunity to increase weightage)</p>
                        </div>
                    </div>
                </div>
            );
        };

        return (
            <div className="sector-rotation-container">
                <RotationCurve />
                <ValuationHeatmap />
            </div>
        );
    };

    // Portfolio Value Over Time Chart
    const PortfolioValueChart = () => {
        if (portfolioHistory.length === 0) {
            return (
                <div className="chart-card">
                    <h3>Portfolio Value Over Time</h3>
                    <p className="chart-subtitle">Track your portfolio's total value daily</p>
                    <div className="empty-chart-state">
                        <p>No historical data available yet. Upload screener or GridKey data to start tracking.</p>
                    </div>
                </div>
            );
        }

        const svgWidth = 900;
        const svgHeight = 400;
        const padding = 60;
        const chartWidth = svgWidth - 2 * padding;
        const chartHeight = svgHeight - 2 * padding;

        const values = portfolioHistory.map(h => h.value);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const valueRange = maxValue - minValue;

        const scaleX = (index: number) => padding + (index / (portfolioHistory.length - 1)) * chartWidth;
        const scaleY = (value: number) => {
            if (valueRange === 0) return svgHeight - padding - chartHeight / 2;
            return svgHeight - padding - ((value - minValue) / valueRange) * chartHeight;
        };

        // Create path for line chart
        const pathData = portfolioHistory.map((entry, index) => {
            const x = scaleX(index);
            const y = scaleY(entry.value);
            return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        }).join(' ');

        // Calculate percentage change
        const firstValue = portfolioHistory[0].value;
        const lastValue = portfolioHistory[portfolioHistory.length - 1].value;
        const totalChange = lastValue - firstValue;
        const percentChange = firstValue > 0 ? (totalChange / firstValue) * 100 : 0;

        // CSV download function
        const downloadCSV = () => {
            const csvData = [
                ['Date', 'Portfolio Value (₹)', 'Timestamp'],
                ...portfolioHistory.map(entry => [
                    new Date(entry.date).toLocaleDateString('en-IN'),
                    entry.value.toFixed(2),
                    entry.timestamp
                ])
            ];
            
            const csvContent = csvData.map(row => row.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', 'portfolio_value_history.csv');
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        };

        return (
            <div className="chart-card portfolio-value-card">
                <div className="chart-header">
                    <div>
                        <h3>Portfolio Value Over Time</h3>
                        <p className="chart-subtitle">Daily tracking of total portfolio value</p>
                    </div>
                    <button onClick={downloadCSV} className="download-csv-btn">
                        Download CSV
                    </button>
                </div>
                <div className="value-summary">
                    <div className="value-stat">
                        <span className="stat-label">Current Value:</span>
                        <span className="stat-value">₹{lastValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="value-stat">
                        <span className="stat-label">Total Change:</span>
                        <span className="stat-value" style={{ color: totalChange >= 0 ? 'var(--success-color)' : 'var(--error-color)' }}>
                            {totalChange >= 0 ? '+' : ''}₹{totalChange.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%)
                        </span>
                    </div>
                    <div className="value-stat">
                        <span className="stat-label">Days Tracked:</span>
                        <span className="stat-value">{portfolioHistory.length}</span>
                    </div>
                </div>
                <div className="portfolio-value-chart-container">
                    <svg width={svgWidth} height={svgHeight} className="portfolio-value-svg">
                        {/* Grid lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                            const y = svgHeight - padding - ratio * chartHeight;
                            const value = minValue + ratio * valueRange;
                            return (
                                <g key={i}>
                                    <line
                                        x1={padding}
                                        y1={y}
                                        x2={svgWidth - padding}
                                        y2={y}
                                        stroke="var(--border-color)"
                                        strokeWidth="1"
                                        opacity="0.3"
                                    />
                                    <text x={padding - 10} y={y + 4} fontSize="10" fill="var(--secondary-text-color)" textAnchor="end">
                                        {(value / 1000).toFixed(0)}K
                                    </text>
                                </g>
                            );
                        })}

                        {/* Area under line */}
                        <path
                            d={`${pathData} L ${scaleX(portfolioHistory.length - 1)} ${svgHeight - padding} L ${padding} ${svgHeight - padding} Z`}
                            fill="var(--accent-color)"
                            opacity="0.1"
                        />

                        {/* Line chart */}
                        <path
                            d={pathData}
                            stroke="var(--accent-color)"
                            strokeWidth="3"
                            fill="none"
                        />

                        {/* Data points */}
                        {portfolioHistory.map((entry, index) => {
                            const x = scaleX(index);
                            const y = scaleY(entry.value);
                            return (
                                <circle
                                    key={index}
                                    cx={x}
                                    cy={y}
                                    r="4"
                                    fill="var(--accent-color)"
                                    stroke="white"
                                    strokeWidth="2"
                                />
                            );
                        })}

                        {/* Axis labels */}
                        <text x={svgWidth / 2} y={svgHeight - 10} fontSize="12" fill="var(--text-color)" textAnchor="middle" fontWeight="600">
                            Date
                        </text>
                        <text x={20} y={svgHeight / 2} fontSize="12" fill="var(--text-color)" textAnchor="middle" transform={`rotate(-90 20 ${svgHeight / 2})`} fontWeight="600">
                            Portfolio Value (₹)
                        </text>

                        {/* Date labels (show every few points to avoid crowding) */}
                        {portfolioHistory.map((entry, index) => {
                            if (portfolioHistory.length <= 10 || index % Math.ceil(portfolioHistory.length / 8) === 0 || index === portfolioHistory.length - 1) {
                                const x = scaleX(index);
                                const dateLabel = new Date(entry.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
                                return (
                                    <text
                                        key={index}
                                        x={x}
                                        y={svgHeight - padding + 20}
                                        fontSize="10"
                                        fill="var(--secondary-text-color)"
                                        textAnchor="middle"
                                    >
                                        {dateLabel}
                                    </text>
                                );
                            }
                            return null;
                        })}
                    </svg>
                </div>
            </div>
        );
    };

    if (gridKeyData.length === 0 || stocks.length === 0) {
        return (
            <div className="analysis-page">
                <header className="main-header">
                    <h1>Portfolio Analysis</h1>
                    <p>Visual insights into your portfolio performance and allocation</p>
                </header>
                <div className="empty-state">
                    <p>No data available. Please upload both GridKey data and Screener data first.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="analysis-page">
            <header className="main-header">
                <h1>Portfolio Analysis</h1>
                <p>Visual insights into your portfolio performance and allocation</p>
            </header>

            <div className="chart-selector">
                <button className={selectedChart === 'allocation' ? 'active' : ''} onClick={() => setSelectedChart('allocation')}>Allocation</button>
                <button className={selectedChart === 'performance' ? 'active' : ''} onClick={() => setSelectedChart('performance')}>Performance</button>
                <button className={selectedChart === 'growth' ? 'active' : ''} onClick={() => setSelectedChart('growth')}>Growth Metrics</button>
                <button className={selectedChart === 'sectors' ? 'active' : ''} onClick={() => setSelectedChart('sectors')}>Sectors</button>
                <button className={selectedChart === 'rotation' ? 'active' : ''} onClick={() => setSelectedChart('rotation')}>Sector Rotation</button>
                <button className={selectedChart === 'value' ? 'active' : ''} onClick={() => setSelectedChart('value')}>Portfolio Value</button>
            </div>

            <div className="charts-container">
                {selectedChart === 'allocation' && <AllocationChart />}
                {selectedChart === 'performance' && <PerformanceChart />}
                {selectedChart === 'growth' && <GrowthChart />}
                {selectedChart === 'sectors' && <SectorChart />}
                {selectedChart === 'rotation' && <SectorRotationView />}
                {selectedChart === 'value' && <PortfolioValueChart />}
            </div>
        </div>
    );
};


const TrendMomentumPage: React.FC<{ gridKeyData: GridKeyData[]; stocks: Stock[] }> = ({ gridKeyData, stocks }) => {
    // Enrich gridKey data with stock information and calculate trend indicators
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
            const dma50 = matchedStock?.dma50 || null;
            const dma200 = matchedStock?.dma200 || null;
            const return1M = matchedStock?.return1M || null;
            const return3M = matchedStock?.return3M || null;
            const return1Y = matchedStock?.return1Y || null;

            // Calculate trend signals
            const priceAboveDMA50 = currentPrice !== null && dma50 !== null ? currentPrice > dma50 : null;
            const priceAboveDMA200 = currentPrice !== null && dma200 !== null ? currentPrice > dma200 : null;
            const goldenCross = dma50 !== null && dma200 !== null ? dma50 > dma200 : null;

            // Calculate DMA 50 proximity percentage
            const dma50Proximity = currentPrice !== null && dma50 !== null && dma50 !== 0
                ? ((currentPrice - dma50) / dma50) * 100
                : null;

            // Determine action zone based on DMA 50 proximity
            let actionZone = 'N/A';
            if (dma50Proximity !== null) {
                if (dma50Proximity < 0) {
                    actionZone = 'Below DMA 50';
                } else if (dma50Proximity >= 0 && dma50Proximity <= 5) {
                    actionZone = 'Buy on Dip';
                } else if (dma50Proximity > 5 && dma50Proximity <= 30) {
                    actionZone = 'Normal Range';
                } else {
                    actionZone = 'Overextended';
                }
            }

            return {
                ...item,
                currentPrice,
                dma50,
                dma200,
                return1M,
                return3M,
                return1Y,
                priceAboveDMA50,
                priceAboveDMA200,
                goldenCross,
                dma50Proximity,
                actionZone
            };
        });
    }, [gridKeyData, stocks]);

    // Filter out items with missing critical data for better visualization
    const validData = enrichedData.filter(item =>
        (item as any).currentPrice !== null &&
        (item as any).dma50 !== null &&
        (item as any).dma200 !== null
    );

    // Trend Matrix Component
    const TrendMatrix = () => {
        return (
            <div className="chart-card trend-matrix-card">
                <h3>Trend Matrix (Technical Signals)</h3>
                <p className="chart-subtitle">Traffic light indicators for trend strength</p>
                <div className="trend-matrix-table-container">
                    <table className="trend-matrix-table">
                        <thead>
                            <tr>
                                <th className="sticky-col">Stock</th>
                                <th>Price &gt; DMA 50<br/><span className="th-subtitle">(Short Term)</span></th>
                                <th>Price &gt; DMA 200<br/><span className="th-subtitle">(Long Term)</span></th>
                                <th>DMA 50 &gt; DMA 200<br/><span className="th-subtitle">(Golden Cross)</span></th>
                                <th>Overall Signal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {validData.map((item, index) => {
                                const bullishSignals = [
                                    (item as any).priceAboveDMA50,
                                    (item as any).priceAboveDMA200,
                                    (item as any).goldenCross
                                ].filter(signal => signal === true).length;

                                let overallSignal = 'Bearish';
                                let overallColor = 'var(--error-color)';
                                if (bullishSignals === 3) {
                                    overallSignal = 'Strong Bullish';
                                    overallColor = 'var(--success-color)';
                                } else if (bullishSignals === 2) {
                                    overallSignal = 'Bullish';
                                    overallColor = '#90EE90';
                                } else if (bullishSignals === 1) {
                                    overallSignal = 'Neutral';
                                    overallColor = '#FFA500';
                                }

                                return (
                                    <tr key={index}>
                                        <td className="stock-name-cell sticky-col">{item.scripName}</td>
                                        <td className="traffic-light-cell">
                                            <span className={`traffic-light ${(item as any).priceAboveDMA50 ? 'green' : 'red'}`}>
                                                {(item as any).priceAboveDMA50 ? '●' : '●'}
                                            </span>
                                        </td>
                                        <td className="traffic-light-cell">
                                            <span className={`traffic-light ${(item as any).priceAboveDMA200 ? 'green' : 'red'}`}>
                                                {(item as any).priceAboveDMA200 ? '●' : '●'}
                                            </span>
                                        </td>
                                        <td className="traffic-light-cell">
                                            <span className={`traffic-light ${(item as any).goldenCross ? 'green' : 'red'}`}>
                                                {(item as any).goldenCross ? '●' : '●'}
                                            </span>
                                        </td>
                                        <td className="overall-signal-cell">
                                            <span className="signal-badge" style={{ backgroundColor: overallColor }}>
                                                {overallSignal}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // Momentum Bar Chart Component
    const MomentumChart = () => {
        const sortedByReturn3M = [...validData]
            .filter(item => (item as any).return3M !== null)
            .sort((a, b) => ((b as any).return3M || 0) - ((a as any).return3M || 0))
            .slice(0, 15); // Top 15

        const maxReturn = Math.max(...sortedByReturn3M.map(item => Math.abs((item as any).return3M || 0)));

        return (
            <div className="chart-card momentum-chart-card">
                <h3>Momentum Leaders (3-Month Returns)</h3>
                <p className="chart-subtitle">Top performers leading the rally</p>
                <div className="bar-chart momentum-bars">
                    {sortedByReturn3M.map((item, index) => {
                        const returnValue = (item as any).return3M || 0;
                        const isPositive = returnValue >= 0;
                        const barWidth = (Math.abs(returnValue) / maxReturn) * 100;

                        return (
                            <div key={index} className="bar-item momentum-bar-item">
                                <div className="bar-label">{item.scripName}</div>
                                <div className="bar-container momentum-bar-container">
                                    <div
                                        className="bar-fill momentum-bar-fill"
                                        style={{
                                            width: `${barWidth}%`,
                                            backgroundColor: isPositive ? 'var(--success-color)' : 'var(--error-color)'
                                        }}
                                    >
                                        <span className="bar-value">{returnValue.toFixed(2)}%</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Moving Average Proximity Gauge Component
    const ProximityGauge = () => {
        const gaugeData = validData
            .filter(item => (item as any).dma50Proximity !== null)
            .map(item => ({
                name: item.scripName,
                proximity: (item as any).dma50Proximity,
                actionZone: (item as any).actionZone,
                currentPrice: (item as any).currentPrice,
                dma50: (item as any).dma50
            }))
            .sort((a, b) => a.proximity - b.proximity);

        return (
            <div className="chart-card proximity-gauge-card">
                <h3>Moving Average Proximity Gauge</h3>
                <p className="chart-subtitle">Distance from DMA 50 - Trading opportunity zones</p>
                <div className="proximity-legend">
                    <div className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: 'var(--error-color)' }}></span>
                        <span>Below DMA 50 (Falling Knife)</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: '#4CAF50' }}></span>
                        <span>0-5% Above (Buy on Dip)</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: '#2196F3' }}></span>
                        <span>5-30% Above (Normal Range)</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: '#FFA500' }}></span>
                        <span>&gt;30% Above (Overextended)</span>
                    </div>
                </div>
                <div className="proximity-table-container">
                    <table className="proximity-table">
                        <thead>
                            <tr>
                                <th className="sticky-col">Stock</th>
                                <th>Current Price</th>
                                <th>DMA 50</th>
                                <th>Distance %</th>
                                <th>Action Zone</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gaugeData.map((item, index) => {
                                let zoneColor = '#2196F3'; // Normal Range
                                if (item.proximity < 0) {
                                    zoneColor = 'var(--error-color)'; // Below
                                } else if (item.proximity <= 5) {
                                    zoneColor = '#4CAF50'; // Buy on Dip
                                } else if (item.proximity > 30) {
                                    zoneColor = '#FFA500'; // Overextended
                                }

                                return (
                                    <tr key={index}>
                                        <td className="stock-name-cell sticky-col">{item.name}</td>
                                        <td className="text-right">₹{item.currentPrice.toFixed(2)}</td>
                                        <td className="text-right">₹{item.dma50.toFixed(2)}</td>
                                        <td className="text-right" style={{
                                            color: item.proximity >= 0 ? 'var(--success-color)' : 'var(--error-color)',
                                            fontWeight: 600
                                        }}>
                                            {item.proximity.toFixed(2)}%
                                        </td>
                                        <td>
                                            <span className="zone-badge" style={{ backgroundColor: zoneColor }}>
                                                {item.actionZone}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    if (validData.length === 0) {
        return (
            <div className="trend-momentum-page">
                <div className="page-header">
                    <h2>Trend & Momentum Dashboard</h2>
                    <p className="page-description">Technical analysis for entry and exit decisions</p>
                </div>
                <div className="empty-state">
                    <p>No data available. Please ensure your portfolio has DMA 50 and DMA 200 values.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="trend-momentum-page">
            <div className="page-header">
                <h2>Trend & Momentum Dashboard</h2>
                <p className="page-description">
                    Technical analysis to identify entry/exit opportunities based on moving averages and momentum
                </p>
            </div>

            <div className="dashboard-grid">
                <TrendMatrix />
                <MomentumChart />
                <ProximityGauge />
            </div>
        </div>
    );
};


interface PrivateInvestments {
    totalInvested: number;
    count: number;
}

const App: React.FC = () => {
    const [page, setPage] = useState<'dashboard' | 'insights' | 'upload' | 'gridkey' | 'analysis' | 'momentum'>('dashboard');
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [gridKeyData, setGridKeyData] = useState<GridKeyData[]>([]);
    const [privateInvestments, setPrivateInvestments] = useState<PrivateInvestments>({ totalInvested: 0, count: 0 });
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const CORRECT_PASSWORD = 'saguncapital321';

    // Check if user is already authenticated
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const authenticated = localStorage.getItem('portfolioAuth');
            if (authenticated === 'true') {
                setIsAuthenticated(true);
            }
        }
    }, []);

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordInput === CORRECT_PASSWORD) {
            setIsAuthenticated(true);
            if (typeof window !== 'undefined') {
                localStorage.setItem('portfolioAuth', 'true');
            }
            setPasswordError('');
        } else {
            setPasswordError('Incorrect password. Please try again.');
            setPasswordInput('');
        }
    };

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

                // Load GridKey data and private investments
                const gridKeyResponse = await fetch('/api/gridkey');
                if (gridKeyResponse.ok) {
                    const { gridKeyData, privateInvestments: privInv } = await gridKeyResponse.json();
                    setGridKeyData(gridKeyData || []);
                    setPrivateInvestments(privInv || { totalInvested: 0, count: 0 });
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

    // Helper function to save portfolio value to history
    const savePortfolioValueToHistory = async () => {
        try {
            // Calculate total portfolio value
            const totalValue = gridKeyData.reduce((sum, item) => {
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
                const currentAmount = (item.quantity && currentPrice) ? item.quantity * currentPrice : 0;
                return sum + currentAmount;
            }, 0);

            if (totalValue > 0) {
                await fetch('/api/portfolio-history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: totalValue })
                });
            }
        } catch (error) {
            console.error('Error saving portfolio history:', error);
            // Don't fail the upload if history save fails
        }
    };

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

                // Save portfolio value to history after stocks are updated
                await savePortfolioValueToHistory();
            } else {
                setStocks(newData);
            }

            setTimeout(() => setPage('insights'), 500);
        } catch (error) {
            console.error('Error updating portfolio data:', error);
            // Still update the UI even if API fails
            setStocks(newData);
        }
    };

    const handleGridKeyUploaded = async (data: GridKeyData[], privateInv: { totalInvested: number; count: number }) => {
        try {
            // Save to API
            const response = await fetch('/api/gridkey', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data, privateInvestments: privateInv }),
            });

            if (!response.ok) {
                throw new Error('Failed to save GridKey data');
            }

            setGridKeyData(data);
            setPrivateInvestments(privateInv);

            // Save portfolio value to history after gridKey is updated
            await savePortfolioValueToHistory();

            setTimeout(() => setPage('insights'), 1000);
        } catch (error) {
            console.error('Error saving GridKey data:', error);
            // Still update the UI even if API fails
            setGridKeyData(data);
            setPrivateInvestments(privateInv);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <h1>Portfolio Insights</h1>
                    <p>Please enter the password to access the application</p>
                    <form onSubmit={handlePasswordSubmit}>
                        <input
                            type="password"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder="Enter password"
                            autoFocus
                            className="password-input"
                        />
                        {passwordError && <div className="password-error">{passwordError}</div>}
                        <button type="submit" className="password-submit">
                            Access Portfolio
                        </button>
                    </form>
                </div>
            </div>
        );
    }

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
                <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>Dashboard</button>
                <button className={page === 'insights' ? 'active' : ''} onClick={() => setPage('insights')}>Portfolio Insights</button>
                <button className={page === 'analysis' ? 'active' : ''} onClick={() => setPage('analysis')}>Analysis</button>
                <button className={page === 'momentum' ? 'active' : ''} onClick={() => setPage('momentum')}>Trend & Momentum</button>
                <button className={page === 'upload' ? 'active' : ''} onClick={() => setPage('upload')}>Screener Data</button>
                <button className={page === 'gridkey' ? 'active' : ''} onClick={() => setPage('gridkey')}>GridKey Data</button>
            </nav>
            <main>
                {page === 'dashboard' && <Dashboard gridKeyData={gridKeyData} stocks={stocks} privateInvestments={privateInvestments} />}
                {page === 'insights' && <PortfolioInsightsPage gridKeyData={gridKeyData} stocks={stocks} onStocksUpdate={setStocks} />}
                {page === 'analysis' && <AnalysisPage gridKeyData={gridKeyData} stocks={stocks} />}
                {page === 'momentum' && <TrendMomentumPage gridKeyData={gridKeyData} stocks={stocks} />}
                {page === 'upload' && <UploadPage onDataUploaded={handleDataUploaded} />}
                {page === 'gridkey' && <GridKeyPage onGridKeyUploaded={handleGridKeyUploaded} />}
            </main>
        </>
    );
}

export default App;