'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Stock, GridKeyData } from '../types';
import { computePortfolioMetricsSnapshot, PORTFOLIO_METRIC_DEFS, formatMetricValue, PortfolioMetricsSnapshot } from '../lib/portfolioMetrics';
import Dashboard from './components/Dashboard';
import EntryDataPage from './components/EntryDataPage';
import AdminPanel from './components/AdminPanel';
import { CorporateEventsChart } from './components/CorporateEventsChart';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import { StockDetailDrawer } from './components/drawer/StockDetailDrawer';
import { PositioningChips } from './components/positioning/PositioningChip';
import { PositioningFilters, PositioningFilterState, INITIAL_POSITIONING_FILTERS } from './components/positioning/PositioningFilters';
import { StockPositioning, Conviction, StrategyType, ActionIntent } from '../types/positioning';
import { PETracker } from './components/pe/PETracker';
import { FactsheetPage } from './components/factsheet/FactsheetPage';
import { PipelinePage } from './components/pipeline/PipelinePage';

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
    const s = `${value}${suffix}`;
    // Real minus glyph (U+2212) per DESIGN.md number formatting.
    return s.charAt(0) === '-' ? `−${s.slice(1)}` : s;
};

// Signed percentage with a real minus glyph (U+2212), fixed to 2 decimals.
const fmtSignedPct = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A';
    return `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}%`;
};

// Signed rupee amount with a real minus glyph (U+2212).
const fmtSignedCur = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A';
    return `${value < 0 ? '−' : ''}₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

// Compact Indian notation for summary/value cells (Part II): ≥1cr → ₹X.XX Cr,
// ≥1L → ₹X.XX L, else full grouped. Returns null for missing so callers render a dash.
const fmtIndianCompact = (value: number | null | undefined): string | null => {
    if (value === null || value === undefined || isNaN(value)) return null;
    const sign = value < 0 ? '−' : '';
    const abs = Math.abs(value);
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
    return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

// Full-precision Indian-grouped unit price (avg cost / current price).
const fmtUnitPrice = (value: number | null | undefined): string | null => {
    if (value === null || value === undefined || isNaN(value)) return null;
    return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

// Muted em dash for missing data (Part II: never a loud N/A).
const PPDash: React.FC = () => <span className="pp-dash">—</span>;

// Gain: signed percentage, semantic colour. Plain number, no bar.
const GainBar: React.FC<{ pct: number | null | undefined }> = ({ pct }) => {
    if (pct === null || pct === undefined || isNaN(pct)) {
        return <span className="pp-gain-label"><PPDash /></span>;
    }
    const color = pct >= 0 ? 'var(--positive)' : 'var(--negative)';
    return <span className="pp-gain-label" style={{ color }}>{fmtSignedPct(pct)}</span>;
};

// Weight: percentage of portfolio. Plain number, no bar.
const WeightBar: React.FC<{ pct: number | null | undefined }> = ({ pct }) => {
    if (pct === null || pct === undefined || isNaN(pct)) {
        return <span className="pp-weight-label"><PPDash /></span>;
    }
    return <span className="pp-weight-label">{pct.toFixed(2)}%</span>;
};

// Action → tinted chip in its own centered column.
const ActionChip: React.FC<{ action: string | null | undefined }> = ({ action }) => {
    if (!action) return <PPDash />;
    return <span className={`pp-action pp-action-${action.toLowerCase()}`}>{action}</span>;
};

// ── Optional analytical columns (opt-in via the Columns picker) ──
const fmtMarketCapCr = (v: number | null | undefined): string | null =>
    v == null || isNaN(v) ? null : (v >= 1000 ? `₹${(v / 1000).toFixed(1)}K Cr` : `₹${v.toFixed(0)} Cr`);

// Signed percentage, semantic colour.
const PctColored: React.FC<{ v: number | null | undefined }> = ({ v }) => {
    if (v == null || isNaN(v)) return <PPDash />;
    return <span style={{ color: v >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{fmtSignedPct(v)}</span>;
};
// Distance percentage with an explicit direction glyph — off-high is always a
// decline (−), off-low always a gain (+), so the sign reads unambiguously even
// though the raw value is a magnitude.
const OffPct: React.FC<{ v: number | null | undefined; dir: 'down' | 'up' }> = ({ v, dir }) => {
    if (v == null || isNaN(v)) return <PPDash />;
    const glyph = dir === 'down' ? '−' : '+';
    return <>{`${glyph}${Math.abs(v).toFixed(2)}%`}</>;
};
// Plain number.
const PlainNum: React.FC<{ v: number | null | undefined; digits?: number }> = ({ v, digits = 2 }) =>
    v == null || isNaN(v) ? <PPDash /> : <>{v.toFixed(digits)}</>;

interface PPCol {
    key: string;
    label: string;      // full label for the picker chip
    short?: string;     // compact header label (defaults to label)
    group: string;
    align: 'left' | 'right' | 'center';
    cell: (it: any) => React.ReactNode;
    foot?: (s: any) => React.ReactNode;
}

const qtyStr = (v: number | null | undefined, d = 2) =>
    v == null || isNaN(v) ? null : v.toLocaleString('en-IN', { maximumFractionDigits: d });

// Unified column registry. Identity (rank + holding) is always shown and is not
// listed here; every column below is toggleable via the Edit-columns panel.
const PP_COLUMNS: PPCol[] = [
    // Position
    { key: 'quantity', label: 'Quantity', group: 'Position', align: 'right', cell: it => qtyStr(it.quantity) ?? <PPDash />, foot: s => qtyStr(s.quantity, 0) },
    { key: 'averageBuyPrice', label: 'Avg buy', group: 'Position', align: 'right', cell: it => (it.averageBuyPrice && it.averageBuyPrice > 0) ? fmtUnitPrice(it.averageBuyPrice) : <span className="pp-note">no cost basis</span> },
    { key: 'investedAmount', label: 'Invested', group: 'Position', align: 'right', cell: it => fmtIndianCompact(it.investedAmount) ?? <PPDash />, foot: s => fmtIndianCompact(s.investedAmount) ?? null },
    { key: 'currentPrice', label: 'Price', group: 'Position', align: 'right', cell: it => fmtUnitPrice(it.currentPrice) ?? <PPDash /> },
    { key: 'calculatedAmount', label: 'Value', group: 'Position', align: 'right', cell: it => <span className="pp-strong">{fmtIndianCompact(it.calculatedAmount) ?? <PPDash />}</span>, foot: s => <span className="pp-strong">{fmtIndianCompact(s.calculatedAmount) ?? <PPDash />}</span> },
    { key: 'absoluteGain', label: 'Abs gain', group: 'Position', align: 'right', cell: it => (it.absoluteGain == null ? <PPDash /> : <span style={{ color: it.absoluteGain >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{fmtSignedCur(it.absoluteGain)}</span>), foot: s => (s.absoluteGain == null ? null : <span style={{ color: s.absoluteGain >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{fmtSignedCur(s.absoluteGain)}</span>) },
    { key: 'gainPercentage', label: 'Gain %', group: 'Position', align: 'right', cell: it => <GainBar pct={it.gainPercentage} />, foot: s => (s.gainPercentage == null ? null : <span style={{ color: s.gainPercentage >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{fmtSignedPct(s.gainPercentage)}</span>) },
    { key: 'weightage', label: 'Weight %', group: 'Position', align: 'right', cell: it => <WeightBar pct={it.weightage} />, foot: s => (s.weightage == null ? null : `${s.weightage.toFixed(2)}%`) },
    { key: 'portfolioContribution', label: 'Contribution %', group: 'Position', align: 'right', cell: it => <PctColored v={it.portfolioContribution} />, foot: s => <PctColored v={s.portfolioContribution} /> },
    // Performance
    { key: 'return1D', label: '1D %', group: 'Performance', align: 'right', cell: it => <PctColored v={it.return1D} />, foot: s => <PctColored v={s.return1D} /> },
    { key: 'return1W', label: '1W %', group: 'Performance', align: 'right', cell: it => <PctColored v={it.return1W} />, foot: s => <PctColored v={s.return1W} /> },
    { key: 'return1M', label: '1M %', group: 'Performance', align: 'right', cell: it => <PctColored v={it.return1M} />, foot: s => <PctColored v={s.return1M} /> },
    { key: 'return3M', label: '3M %', group: 'Performance', align: 'right', cell: it => <PctColored v={it.return3M} />, foot: s => <PctColored v={s.return3M} /> },
    { key: 'return6M', label: '6M %', group: 'Performance', align: 'right', cell: it => <PctColored v={it.return6M} />, foot: s => <PctColored v={s.return6M} /> },
    { key: 'return1Y', label: '1Y %', group: 'Performance', align: 'right', cell: it => <PctColored v={it.return1Y} />, foot: s => <PctColored v={s.return1Y} /> },
    // Fundamentals
    { key: 'priceToEarning', label: 'P/E', group: 'Fundamentals', align: 'right', cell: it => <PlainNum v={it.priceToEarning} />, foot: s => <PlainNum v={s.priceToEarning} /> },
    { key: 'marketCap', label: 'Market cap', short: 'Mkt cap', group: 'Fundamentals', align: 'right', cell: it => fmtMarketCapCr(it.marketCap) ?? <PPDash />, foot: s => fmtMarketCapCr(s.marketCap) ?? null },
    { key: 'roce', label: 'ROCE %', group: 'Fundamentals', align: 'right', cell: it => <PctColored v={it.roce} />, foot: s => <PctColored v={s.roce} /> },
    { key: 'yoyQuarterlyProfitGrowth', label: 'Profit growth %', short: 'Profit gr %', group: 'Fundamentals', align: 'right', cell: it => <PctColored v={it.yoyQuarterlyProfitGrowth} />, foot: s => <PctColored v={s.yoyQuarterlyProfitGrowth} /> },
    { key: 'yoyQuarterlySalesGrowth', label: 'Sales growth %', short: 'Sales gr %', group: 'Fundamentals', align: 'right', cell: it => <PctColored v={it.yoyQuarterlySalesGrowth} />, foot: s => <PctColored v={s.yoyQuarterlySalesGrowth} /> },
    // Technicals
    { key: 'rsi', label: 'RSI', group: 'Technicals', align: 'right', cell: it => (it.rsi == null || isNaN(it.rsi)) ? <PPDash /> : <span style={{ color: it.rsi > 70 ? 'var(--negative)' : it.rsi < 30 ? 'var(--positive)' : undefined }}>{it.rsi.toFixed(1)}</span>, foot: s => <PlainNum v={s.rsi} digits={1} /> },
    { key: 'dma50ChangePercent', label: 'vs 50 DMA', group: 'Technicals', align: 'right', cell: it => <PctColored v={it.dma50ChangePercent} />, foot: s => <PctColored v={s.dma50ChangePercent} /> },
    { key: 'dma200ChangePercent', label: 'vs 200 DMA', group: 'Technicals', align: 'right', cell: it => <PctColored v={it.dma200ChangePercent} />, foot: s => <PctColored v={s.dma200ChangePercent} /> },
    { key: 'downFrom52WeekHigh', label: 'From 52w high', short: 'Off 52w hi', group: 'Technicals', align: 'right', cell: it => <OffPct v={it.downFrom52WeekHigh} dir="down" />, foot: s => <OffPct v={s.downFrom52WeekHigh} dir="down" /> },
    { key: 'upFrom52WeekLow', label: 'From 52w low', short: 'Off 52w lo', group: 'Technicals', align: 'right', cell: it => <OffPct v={it.upFrom52WeekLow} dir="up" />, foot: s => <OffPct v={s.upFrom52WeekLow} dir="up" /> },
    { key: 'trend', label: 'Trend', group: 'Technicals', align: 'left', cell: it => it.trend ? <span className={`trend-badge trend-${String(it.trend).toLowerCase().replace(/\s+/g, '-')}`}>{it.trend}</span> : <PPDash /> },
    // Classification
    { key: 'industry', label: 'Industry', group: 'Classification', align: 'left', cell: it => it.industry || <PPDash /> },
    { key: 'industryGroup', label: 'Industry group', group: 'Classification', align: 'left', cell: it => it.industryGroup || <PPDash /> },
    { key: 'positioning', label: 'Positioning', group: 'Classification', align: 'center', cell: it => <ActionChip action={it.positioning?.actionIntent} /> },
    { key: 'bucket', label: 'Bucket', group: 'Classification', align: 'left', cell: it => it.bucket || <PPDash /> },
    // Ownership
    { key: 'pledgedQty', label: 'Pledged qty', group: 'Ownership', align: 'right', cell: it => qtyStr(it.pledgedQty) ?? <PPDash /> },
    { key: 'freeQty', label: 'Free qty', group: 'Ownership', align: 'right', cell: it => qtyStr(it.freeQty) ?? <PPDash /> },
    { key: 'pledgedWhere', label: 'Pledged where', group: 'Ownership', align: 'left', cell: it => it.pledgedWhere || <PPDash /> },
    // Workflow
    { key: 'assignedTo', label: 'Assigned to', group: 'Workflow', align: 'left', cell: it => it.assignedTo || <PPDash /> },
    { key: 'remarks', label: 'Remarks', group: 'Workflow', align: 'left', cell: it => it.remarks || <PPDash /> },
];

const PP_GROUP_ORDER = ['Position', 'Performance', 'Fundamentals', 'Technicals', 'Classification', 'Ownership', 'Workflow'];

// The default "lens" — shown until the user customises.
const PP_DEFAULT_COLUMNS = ['quantity', 'averageBuyPrice', 'investedAmount', 'currentPrice', 'calculatedAmount', 'gainPercentage', 'weightage'];

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

// TEAM_MEMBERS is now fetched dynamically from /api/team-members
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

// Columns that should be hidden from analysts (financial amounts)
const ANALYST_RESTRICTED_COLUMNS = ['quantity', 'investedAmount', 'calculatedAmount', 'absoluteGain', 'pledgedQty', 'pledgedWhere', 'freeQty'];

// Trend options used by the multi-select trend filter.
const TREND_OPTIONS = ['Strong Uptrend', 'Uptrend', 'Neutral', 'Downtrend', 'Strong Downtrend'];

// Sentinel used inside the assignee/bucket multi-selects to match rows with no value.
const UNASSIGNED = 'Unassigned';

// Categorical filter state. Multi-selects hold an array of selected values
// (empty = no filter). Text fields and the single-select pledged filter are strings.
interface FilterState {
    searchTerm: string;
    remarksSearch: string;
    trend: string[];
    assignedTo: string[];
    bucket: string[];
    industryGroup: string[];
    industry: string[];
    pledged: string; // 'All' | 'Pledged' | 'Unpledged' | 'LAS' | 'F&O'
}

const INITIAL_FILTERS: FilterState = {
    searchTerm: '',
    remarksSearch: '',
    trend: [],
    assignedTo: [],
    bucket: [],
    industryGroup: [],
    industry: [],
    pledged: 'All',
};

// Every numeric column that supports a min/max range filter. Range-filter state
// keys follow a regular `${key}Min` / `${key}Max` convention so filtering and the
// popover UI can be driven entirely from this list.
const NUMERIC_FILTER_DEFS: { key: string; label: string }[] = [
    { key: 'gainPercentage', label: 'Gain %' },
    { key: 'weightage', label: 'Weightage %' },
    { key: 'portfolioContribution', label: 'Portfolio Contribution %' },
    { key: 'priceToEarning', label: 'P/E' },
    { key: 'marketCap', label: 'Market Cap (Cr)' },
    { key: 'rsi', label: 'RSI' },
    { key: 'roce', label: 'ROCE %' },
    { key: 'yoyQuarterlyProfitGrowth', label: 'Profit Growth %' },
    { key: 'yoyQuarterlySalesGrowth', label: 'Sales Growth %' },
    { key: 'dma50ChangePercent', label: 'Chg % vs 50 DMA' },
    { key: 'dma200ChangePercent', label: 'Chg % vs 200 DMA' },
    { key: 'downFrom52WeekHigh', label: 'Down from 52W High %' },
    { key: 'upFrom52WeekLow', label: 'Up from 52W Low %' },
    { key: 'return1D', label: '1D %' },
    { key: 'return1W', label: '1W %' },
    { key: 'return1M', label: '1M %' },
    { key: 'return3M', label: '3M %' },
    { key: 'return6M', label: '6M %' },
    { key: 'return1Y', label: '1Y %' },
];

const INITIAL_RANGE_FILTERS: Record<string, string> = NUMERIC_FILTER_DEFS.reduce((acc, def) => {
    acc[`${def.key}Min`] = '';
    acc[`${def.key}Max`] = '';
    return acc;
}, {} as Record<string, string>);

// Coerce a (possibly legacy-shaped) saved filter object into the current FilterState.
const normalizeFilters = (f: any): FilterState => ({
    searchTerm: typeof f?.searchTerm === 'string' ? f.searchTerm : '',
    remarksSearch: typeof f?.remarksSearch === 'string' ? f.remarksSearch : '',
    trend: Array.isArray(f?.trend) ? f.trend : [],
    assignedTo: Array.isArray(f?.assignedTo) ? f.assignedTo : [],
    bucket: Array.isArray(f?.bucket) ? f.bucket : [],
    industryGroup: Array.isArray(f?.industryGroup) ? f.industryGroup : [],
    industry: Array.isArray(f?.industry) ? f.industry : [],
    pledged: typeof f?.pledged === 'string' ? f.pledged : 'All',
});

const PortfolioInsightsPage: React.FC<{ gridKeyData: GridKeyData[]; stocks: Stock[]; onStocksUpdate: (stocks: Stock[]) => void; isAnalyst?: boolean; teamMembers?: string[] }> = ({ gridKeyData, stocks, onStocksUpdate, isAnalyst = false, teamMembers = [] }) => {
    // Default sort = portfolio weight descending (Part II: never alphabetical —
    // alphabetical buries an 18% position beneath a 0.06% one).
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({
        key: 'weightage',
        direction: 'descending',
    });
    const [remarkValue, setRemarkValue] = useState<string>('');
    const [filters, setFilters] = useState<FilterState>(() => ({ ...INITIAL_FILTERS }));
    const [positioningFilters, setPositioningFilters] = useState<PositioningFilterState>(INITIAL_POSITIONING_FILTERS);
    const [rangeFilters, setRangeFilters] = useState<Record<string, string>>(() => ({ ...INITIAL_RANGE_FILTERS }));
    const [showFilterPopover, setShowFilterPopover] = useState(false);
    const [showColumnPanel, setShowColumnPanel] = useState(false);
    const [remarksModalData, setRemarksModalData] = useState<any>(null);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

    // Stock detail drawer state
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedStock, setSelectedStock] = useState<{ code: string; name: string; positioning?: any } | null>(null);

    // Column visibility. Identity (rank + holding) is always shown; every other
    // column is toggleable via the Edit-columns panel. Default = the lens below.
    const COLUMN_PREFS_KEY = 'ppColumns_v3';
    const buildDefaultColumns = () => PP_COLUMNS.reduce((acc, col) => {
        acc[col.key] = PP_DEFAULT_COLUMNS.includes(col.key);
        return acc;
    }, {} as Record<string, boolean>);
    const initialVisibleColumns = buildDefaultColumns();

    const loadColumnPreferences = () => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(COLUMN_PREFS_KEY);
            if (saved) {
                try {
                    return { ...initialVisibleColumns, ...JSON.parse(saved) };
                } catch (e) {
                    return initialVisibleColumns;
                }
            }
        }
        return initialVisibleColumns;
    };

    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(loadColumnPreferences);

    const persistColumns = (next: Record<string, boolean>) => {
        setVisibleColumns(next);
        if (typeof window !== 'undefined') localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(next));
    };
    const toggleColumn = (key: string) => persistColumns({ ...visibleColumns, [key]: !visibleColumns[key] });
    const resetColumns = () => persistColumns(buildDefaultColumns());

    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // ===== Saved Views (Public Portfolio only) =====
    // A view snapshots the filters, sort, column visibility and view mode so it
    // can be re-applied with a single click. Persisted per-browser in localStorage.
    const SAVED_VIEWS_KEY = 'portfolioSavedViews';
    interface SavedView {
        id: string;
        name: string;
        state: {
            filters: typeof filters;
            positioningFilters: PositioningFilterState;
            rangeFilters: typeof rangeFilters;
            sortConfig: typeof sortConfig;
            visibleColumns: Record<string, boolean>;
            viewMode: 'table' | 'grid';
        };
    }

    const loadSavedViews = (): SavedView[] => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem(SAVED_VIEWS_KEY);
                if (saved) return JSON.parse(saved);
            } catch (e) {
                return [];
            }
        }
        return [];
    };

    const [savedViews, setSavedViews] = useState<SavedView[]>(loadSavedViews);
    const [activeViewId, setActiveViewId] = useState<string | null>(null);

    const persistViews = (views: SavedView[]) => {
        setSavedViews(views);
        if (typeof window !== 'undefined') {
            localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
        }
    };

    const captureViewState = (): SavedView['state'] => ({
        filters,
        positioningFilters,
        rangeFilters,
        sortConfig,
        visibleColumns,
        viewMode,
    });

    const applyView = (view: SavedView) => {
        const s = view.state || ({} as SavedView['state']);
        // Normalize against current defaults so views saved before a filter-shape
        // change still apply cleanly.
        setFilters(normalizeFilters(s.filters));
        setPositioningFilters(s.positioningFilters || INITIAL_POSITIONING_FILTERS);
        setRangeFilters({ ...INITIAL_RANGE_FILTERS, ...(s.rangeFilters || {}) });
        if (s.sortConfig) setSortConfig(s.sortConfig);
        if (s.visibleColumns) setVisibleColumns(s.visibleColumns);
        if (s.viewMode) setViewMode(s.viewMode);
        setActiveViewId(view.id);
    };

    const saveCurrentView = () => {
        const name = typeof window !== 'undefined' ? window.prompt('Save current view as:') : null;
        if (!name || !name.trim()) return;
        const trimmed = name.trim();
        const existing = savedViews.find(v => v.name.toLowerCase() === trimmed.toLowerCase());
        let id: string;
        let next: SavedView[];
        if (existing) {
            id = existing.id;
            next = savedViews.map(v => (v.id === existing.id ? { ...v, state: captureViewState() } : v));
        } else {
            id = `view-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
            next = [...savedViews, { id, name: trimmed, state: captureViewState() }];
        }
        persistViews(next);
        setActiveViewId(id);
    };

    const updateActiveView = () => {
        if (!activeViewId) return;
        persistViews(savedViews.map(v => (v.id === activeViewId ? { ...v, state: captureViewState() } : v)));
    };

    const deleteView = (id: string) => {
        persistViews(savedViews.filter(v => v.id !== id));
        if (activeViewId === id) setActiveViewId(null);
    };

    // Delete requires an explicit confirmation so it can't happen by accident.
    const handleDeleteView = (view: SavedView) => {
        if (typeof window !== 'undefined' && !window.confirm(`Delete the saved view "${view.name}"? This can't be undone.`)) {
            return;
        }
        deleteView(view.id);
    };

    // Turn off the active view: clear its highlight and reset all filters back
    // to the unfiltered default.
    const deactivateView = () => {
        setActiveViewId(null);
        setFilters({ ...INITIAL_FILTERS });
        setRangeFilters({ ...INITIAL_RANGE_FILTERS });
        setPositioningFilters(INITIAL_POSITIONING_FILTERS);
    };

    // Lookup of stock by NSE/BSE code (lowercased). Built once per stocks change
    // so enrichment is O(n) instead of an O(n²) find-in-map.
    const stockByCode = useMemo(() => {
        const map = new Map<string, Stock>();
        for (const stock of stocks) {
            if (stock.nseCode) map.set(stock.nseCode.toLowerCase(), stock);
            if (stock.bseCode) map.set(stock.bseCode.toLowerCase(), stock);
        }
        return map;
    }, [stocks]);

    const findStockForItem = (item: { nseCode: string | null; bseCode: string | null }) =>
        (item.nseCode ? stockByCode.get(item.nseCode.toLowerCase()) : undefined)
        ?? (item.bseCode ? stockByCode.get(item.bseCode.toLowerCase()) : undefined);

    // Enrich GridKey data with all stock data from portfolio and calculate amounts
    const enrichedData = useMemo(() => {
        return gridKeyData.map(item => {
            const matchedStock = findStockForItem(item);
            const currentPrice = matchedStock?.currentPrice || null;
            const calculatedAmount = (item.quantity && currentPrice) ? item.quantity * currentPrice : null;
            const investedAmount = (item.quantity && item.averageBuyPrice) ? item.quantity * item.averageBuyPrice : null;
            const absoluteGain = (calculatedAmount !== null && investedAmount !== null) ? calculatedAmount - investedAmount : null;
            const gainPercentage = (investedAmount !== null && investedAmount !== 0 && absoluteGain !== null)
                ? (absoluteGain / investedAmount) * 100
                : null;
            const trend = matchedStock ? calculateTrend(matchedStock) : null;

            // Pledge data (LAS / F&O). Free qty = held quantity minus pledged.
            const pledgedQty = matchedStock?.pledgedQty ?? null;
            const pledgedWhere = matchedStock?.pledgedWhere ?? null;
            const freeQty = item.quantity != null ? item.quantity - (pledgedQty || 0) : null;

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
                priceToEarning: matchedStock?.priceToEarning ?? null,
                marketCap: matchedStock?.marketCap ?? null,
                rsi: matchedStock?.rsi ?? null,
                roce: matchedStock?.roce ?? null,
                yoyQuarterlyProfitGrowth: matchedStock?.yoyQuarterlyProfitGrowth ?? null,
                yoyQuarterlySalesGrowth: matchedStock?.yoyQuarterlySalesGrowth ?? null,
                dma50: dma50,
                dma200: dma200,
                dma50ChangePercent: dma50ChangePercent,
                dma200ChangePercent: dma200ChangePercent,
                downFrom52WeekHigh: matchedStock?.downFrom52WeekHigh ?? null,
                upFrom52WeekLow: matchedStock?.upFrom52WeekLow ?? null,
                return1D: matchedStock?.return1D ?? null,
                return1W: matchedStock?.return1W ?? null,
                return1M: matchedStock?.return1M ?? null,
                return3M: matchedStock?.return3M ?? null,
                return6M: matchedStock?.return6M ?? null,
                return1Y: matchedStock?.return1Y ?? null,
                remarks: matchedStock?.remarks || null,
                assignedTo: matchedStock?.assignedTo || null,
                bucket: matchedStock?.bucket || null,
                entryDate: matchedStock?.entryDate || null,
                entryPrice: matchedStock?.entryPrice || null,
                positioning: matchedStock?.positioning || null,
                pledgedQty,
                pledgedWhere,
                freeQty
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
            const matchedStock = findStockForItem(item);

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


    // Toggle a value in one of the multi-select categorical filters.
    const toggleMultiFilter = (name: 'trend' | 'assignedTo' | 'bucket' | 'industryGroup' | 'industry', value: string) => {
        setFilters(prev => {
            const current = prev[name];
            const next = current.includes(value)
                ? current.filter(v => v !== value)
                : [...current, value];
            return { ...prev, [name]: next };
        });
    };

    const clearAllFilters = () => {
        setFilters({ ...INITIAL_FILTERS });
        setRangeFilters({ ...INITIAL_RANGE_FILTERS });
        setPositioningFilters(INITIAL_POSITIONING_FILTERS);
    };

    // Distinct industry / industry-group values present in the current holdings,
    // used to populate the multi-select filter checkboxes.
    const availableIndustries = useMemo(
        () => Array.from(new Set(enrichedData.map(i => (i as any).industry).filter(Boolean))).sort() as string[],
        [enrichedData]
    );
    const availableIndustryGroups = useMemo(
        () => Array.from(new Set(enrichedData.map(i => (i as any).industryGroup).filter(Boolean))).sort() as string[],
        [enrichedData]
    );

    // Count of active filters, for the popover header / clear button.
    const activeFilterCount =
        (filters.trend.length ? 1 : 0) +
        (filters.assignedTo.length ? 1 : 0) +
        (filters.bucket.length ? 1 : 0) +
        (filters.industryGroup.length ? 1 : 0) +
        (filters.industry.length ? 1 : 0) +
        (filters.pledged !== 'All' ? 1 : 0) +
        (filters.remarksSearch ? 1 : 0) +
        NUMERIC_FILTER_DEFS.reduce((n, d) => n + ((rangeFilters[`${d.key}Min`] || rangeFilters[`${d.key}Max`]) ? 1 : 0), 0) +
        positioningFilters.convictions.length + positioningFilters.strategies.length + positioningFilters.actions.length;

    // Renders one multi-select filter as a scrollable checkbox list.
    const renderCheckGroup = (
        name: 'trend' | 'assignedTo' | 'bucket' | 'industryGroup' | 'industry',
        label: string,
        options: string[],
    ) => (
        <div className="filter-group">
            <label>{label}{filters[name].length ? ` (${filters[name].length})` : ''}</label>
            <div className="filter-check-list">
                {options.length === 0 && <span className="filter-empty">None available</span>}
                {options.map(opt => (
                    <label key={opt} className="filter-check">
                        <input
                            type="checkbox"
                            checked={filters[name].includes(opt)}
                            onChange={() => toggleMultiFilter(name, opt)}
                        />
                        <span>{opt}</span>
                    </label>
                ))}
            </div>
        </div>
    );

    const filteredAndSortedData = useMemo(() => {
        let filtered = [...enrichedDataWithWeightage];

        // Apply search filter
        if (filters.searchTerm) {
            filtered = filtered.filter(item =>
                item.scripName.toLowerCase().includes(filters.searchTerm.toLowerCase())
            );
        }

        // Apply assignment filter (multi-select; 'Unassigned' matches rows with no assignee)
        if (filters.assignedTo.length > 0) {
            filtered = filtered.filter(item => filters.assignedTo.includes((item as any).assignedTo || UNASSIGNED));
        }

        // Apply bucket filter (multi-select; 'Unassigned' matches rows with no bucket)
        if (filters.bucket.length > 0) {
            filtered = filtered.filter(item => filters.bucket.includes((item as any).bucket || UNASSIGNED));
        }

        // Apply industry group filter (multi-select)
        if (filters.industryGroup.length > 0) {
            filtered = filtered.filter(item => filters.industryGroup.includes((item as any).industryGroup));
        }

        // Apply industry filter (multi-select)
        if (filters.industry.length > 0) {
            filtered = filtered.filter(item => filters.industry.includes((item as any).industry));
        }

        // Apply pledged filter
        if (filters.pledged !== 'All') {
            filtered = filtered.filter(item => {
                const qty = (item as any).pledgedQty;
                const where = (item as any).pledgedWhere;
                const isPledged = qty != null && qty > 0;
                if (filters.pledged === 'Pledged') return isPledged;
                if (filters.pledged === 'Unpledged') return !isPledged;
                return where === filters.pledged; // 'LAS' or 'F&O'
            });
        }

        // Apply remarks filter
        if (filters.remarksSearch) {
            filtered = filtered.filter(item =>
                (item as any).remarks && (item as any).remarks.toLowerCase().includes(filters.remarksSearch.toLowerCase())
            );
        }

        // Apply trend filter (multi-select)
        if (filters.trend.length > 0) {
            filtered = filtered.filter(item => filters.trend.includes((item as any).trend));
        }

        // Apply positioning filters
        if (positioningFilters.convictions.length > 0) {
            filtered = filtered.filter(item => {
                const positioning = (item as any).positioning;
                return positioning && positioningFilters.convictions.includes(positioning.conviction);
            });
        }
        if (positioningFilters.strategies.length > 0) {
            filtered = filtered.filter(item => {
                const positioning = (item as any).positioning;
                return positioning && positioningFilters.strategies.includes(positioning.strategyType);
            });
        }
        if (positioningFilters.actions.length > 0) {
            filtered = filtered.filter(item => {
                const positioning = (item as any).positioning;
                return positioning && positioningFilters.actions.includes(positioning.actionIntent);
            });
        }

        // Apply numeric range filters (data-driven from NUMERIC_FILTER_DEFS)
        filtered = filtered.filter(item => {
            const data = item as any;
            for (const def of NUMERIC_FILTER_DEFS) {
                const v = data[def.key];
                if (v === null || v === undefined) continue;
                const minRaw = rangeFilters[`${def.key}Min`];
                const maxRaw = rangeFilters[`${def.key}Max`];
                if (minRaw !== undefined && minRaw !== '' && v < parseFloat(minRaw)) return false;
                if (maxRaw !== undefined && maxRaw !== '' && v > parseFloat(maxRaw)) return false;
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
    }, [enrichedDataWithWeightage, sortConfig, filters, rangeFilters, positioningFilters]);

    // Column totals / weighted averages for the currently displayed rows.
    // Sums for value-like columns; value-weighted averages for ratio/return
    // columns. Reflects whatever filters (and therefore saved view) are active.
    const summary = useMemo(() => {
        const rows = filteredAndSortedData as any[];
        const sum = (key: string) => rows.reduce((acc, r) => acc + (typeof r[key] === 'number' && !isNaN(r[key]) ? r[key] : 0), 0);
        const wavg = (key: string) => {
            let num = 0, den = 0;
            for (const r of rows) {
                const v = r[key];
                const w = r.calculatedAmount;
                if (typeof v === 'number' && !isNaN(v) && typeof w === 'number' && w > 0) {
                    num += v * w;
                    den += w;
                }
            }
            return den > 0 ? num / den : null;
        };
        const totalInvested = sum('investedAmount');
        const totalGain = sum('absoluteGain');
        return {
            count: rows.length,
            quantity: sum('quantity'),
            pledgedQty: sum('pledgedQty'),
            freeQty: sum('freeQty'),
            investedAmount: totalInvested,
            calculatedAmount: sum('calculatedAmount'),
            absoluteGain: totalGain,
            gainPercentage: totalInvested > 0 ? (totalGain / totalInvested) * 100 : null,
            weightage: sum('weightage'),
            portfolioContribution: sum('portfolioContribution'),
            priceToEarning: wavg('priceToEarning'),
            marketCap: wavg('marketCap'),
            rsi: wavg('rsi'),
            roce: wavg('roce'),
            yoyQuarterlyProfitGrowth: wavg('yoyQuarterlyProfitGrowth'),
            yoyQuarterlySalesGrowth: wavg('yoyQuarterlySalesGrowth'),
            dma50ChangePercent: wavg('dma50ChangePercent'),
            dma200ChangePercent: wavg('dma200ChangePercent'),
            downFrom52WeekHigh: wavg('downFrom52WeekHigh'),
            upFrom52WeekLow: wavg('upFrom52WeekLow'),
            return1D: wavg('return1D'),
            return1W: wavg('return1W'),
            return1M: wavg('return1M'),
            return3M: wavg('return3M'),
            return6M: wavg('return6M'),
            return1Y: wavg('return1Y'),
        };
    }, [filteredAndSortedData]);

    // Sortable header cell for the dense grid. Active column is inked with a
    // directional arrow; all others stay muted (Part II table chrome).
    const PPTh: React.FC<{ k?: string; label: React.ReactNode; align?: 'left' | 'right' | 'center'; sticky?: boolean }> = ({ k, label, align = 'right', sticky }) => {
        const active = !!k && sortConfig.key === k;
        return (
            <th
                className={`pp-th pp-th-${align} ${sticky ? 'pp-th-id' : ''} ${active ? 'pp-sorted' : ''}`}
                onClick={k ? () => requestSort(k) : undefined}
                style={k ? { cursor: 'pointer' } : undefined}
            >
                <span className="pp-th-label">
                    {label}
                    {active && <span className="pp-sort-arrow">{sortConfig.direction === 'descending' ? ' ↓' : ' ↑'}</span>}
                </span>
            </th>
        );
    };

    // Columns the user has switched on, in registry order (analyst-restricted filtered out).
    const columnPickable = PP_COLUMNS.filter(c => !(isAnalyst && ANALYST_RESTRICTED_COLUMNS.includes(c.key)));
    const visibleOptional = columnPickable.filter(c => visibleColumns[c.key]);
    const shownColumnCount = visibleOptional.length;

    const handleStockNameClick = (item: any) => {
        const stockCode = item.nseCode || item.bseCode;
        const stockName = item.scripName || item.name;
        if (stockCode) {
            setSelectedStock({ code: stockCode, name: stockName, positioning: (item as any).positioning || null });
            setIsDrawerOpen(true);
        }
    };

    const handleOpenRemarksModal = (item: any) => {
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

    // Save pledge quantity and/or where. Pass the whole next state so a single
    // POST persists both fields together.
    const handlePledgeChange = async (item: any, next: { pledgedQty?: number | null; pledgedWhere?: string | null }) => {
        const code = item.nseCode || item.bseCode;
        if (!code) return;

        const pledgedQty = next.pledgedQty !== undefined ? next.pledgedQty : (item.pledgedQty ?? null);
        const pledgedWhere = next.pledgedWhere !== undefined ? next.pledgedWhere : (item.pledgedWhere ?? null);

        try {
            const response = await fetch('/api/pledges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, pledgedQty, pledgedWhere })
            });

            if (response.ok) {
                const updatedStocks = stocks.map(s => {
                    if ((s.nseCode && s.nseCode === item.nseCode) || (s.bseCode && s.bseCode === item.bseCode)) {
                        return { ...s, pledgedQty: pledgedQty as any, pledgedWhere: (pledgedWhere || null) as any };
                    }
                    return s;
                });
                onStocksUpdate(updatedStocks);
            }
        } catch (error) {
            console.error('Error saving pledge:', error);
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
                            <div className="saved-views-inline">
                                <span className="saved-views-label">Views</span>
                                {savedViews.map(v => (
                                    <div key={v.id} className={`saved-view-chip ${activeViewId === v.id ? 'active' : ''}`}>
                                        <button
                                            type="button"
                                            className="saved-view-apply"
                                            onClick={() => (activeViewId === v.id ? deactivateView() : applyView(v))}
                                            title={activeViewId === v.id ? 'View is on — click to turn off' : 'Click to apply this view'}
                                        >
                                            {activeViewId === v.id && (
                                                <svg className="saved-view-check" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                                    <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                                                </svg>
                                            )}
                                            {v.name}
                                        </button>
                                        <button
                                            type="button"
                                            className="saved-view-delete"
                                            onClick={() => handleDeleteView(v)}
                                            title="Delete this view"
                                            aria-label={`Delete view ${v.name}`}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
                                                <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                {activeViewId && (
                                    <button type="button" className="saved-view-update" onClick={updateActiveView} title="Overwrite the active view with current filters & columns">
                                        Update
                                    </button>
                                )}
                                <button type="button" className="saved-view-save" onClick={saveCurrentView} title="Save current filters & columns as a view">
                                    + Save View
                                </button>
                            </div>
                            <div className="view-toggle" role="group" aria-label="View mode">
                                <button
                                    type="button"
                                    className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                                    onClick={() => setViewMode('table')}
                                    title="Table view"
                                    aria-pressed={viewMode === 'table'}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm15 2h-4v3h4zm0 4h-4v3h4zm0 4h-4v3h3a1 1 0 0 0 1-1zm-5 3v-3H6v3zm-5 0v-3H1v2a1 1 0 0 0 1 1zm-4-4h4V8H1zm0-4h4V4H1zm5 0h4V4H6zm4 4H6v3h4z"/>
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                    onClick={() => setViewMode('grid')}
                                    title="Grid view"
                                    aria-pressed={viewMode === 'grid'}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5z"/>
                                    </svg>
                                </button>
                            </div>
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
                            <button
                                className={`pp-editcols-btn ${showColumnPanel ? 'active' : ''}`}
                                onClick={() => setShowColumnPanel(v => !v)}
                                aria-expanded={showColumnPanel}
                            >
                                Edit columns ({shownColumnCount})
                            </button>
                        </div>
                    </div>

                    {showColumnPanel && (
                        <div className="pp-colpanel">
                            <div className="pp-colpanel-head">
                                <h3>Choose columns</h3>
                                <div className="pp-colpanel-meta">
                                    <span>{shownColumnCount} shown · identity columns always visible</span>
                                    <button type="button" className="pp-colpanel-reset" onClick={resetColumns}>Reset to lens</button>
                                </div>
                            </div>
                            {PP_GROUP_ORDER.map(group => {
                                const cols = columnPickable.filter(c => c.group === group);
                                if (cols.length === 0) return null;
                                return (
                                    <div className="pp-colgroup" key={group}>
                                        <div className="pp-colgroup-label">{group}</div>
                                        <div className="pp-colgroup-chips">
                                            {cols.map(c => {
                                                const on = !!visibleColumns[c.key];
                                                return (
                                                    <button
                                                        key={c.key}
                                                        type="button"
                                                        className={`pp-colchip ${on ? 'on' : ''}`}
                                                        onClick={() => toggleColumn(c.key)}
                                                        aria-pressed={on}
                                                    >
                                                        {on && <span className="pp-colchip-check">✓</span>}{c.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {showFilterPopover && (
                        <div className="popover-backdrop" onClick={() => setShowFilterPopover(false)}>
                            <div className="popover-content" onClick={e => e.stopPropagation()}>
                                <div className="popover-header">
                                    <h3>Filters &amp; Columns{activeFilterCount ? ` · ${activeFilterCount} active` : ''}</h3>
                                    <div className="popover-header-actions">
                                        {activeFilterCount > 0 && (
                                            <button type="button" className="clear-filter-btn" onClick={clearAllFilters}>Clear all</button>
                                        )}
                                        <button className="close-btn" onClick={() => setShowFilterPopover(false)}>×</button>
                                    </div>
                                </div>
                                <div className="popover-body">
                                    <PositioningFilters
                                        filters={positioningFilters}
                                        onChange={setPositioningFilters}
                                    />
                                    <div className="filter-grid">
                                        {renderCheckGroup('trend', 'Trend', TREND_OPTIONS)}
                                        {renderCheckGroup('bucket', 'Bucket', [UNASSIGNED, ...BUCKETS])}
                                        {renderCheckGroup('assignedTo', 'Assigned To', [UNASSIGNED, ...teamMembers])}
                                        {renderCheckGroup('industryGroup', 'Industry Group', availableIndustryGroups)}
                                        {renderCheckGroup('industry', 'Industry', availableIndustries)}
                                        {!isAnalyst && (
                                            <div className="filter-group">
                                                <label htmlFor="pledged">Pledged</label>
                                                <select id="pledged" name="pledged" value={filters.pledged} onChange={handleFilterChange}>
                                                    <option value="All">All</option>
                                                    <option value="Pledged">Pledged (any)</option>
                                                    <option value="Unpledged">Unpledged</option>
                                                    <option value="LAS">LAS</option>
                                                    <option value="F&O">F&amp;O</option>
                                                </select>
                                            </div>
                                        )}
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
                                    </div>

                                    <div className="filter-ranges-container">
                                        <label>Numeric Ranges (min / max)</label>
                                        <div className="filter-range-grid">
                                            {NUMERIC_FILTER_DEFS.map(def => (
                                                <div key={def.key} className="filter-range-row">
                                                    <span className="filter-range-label">{def.label}</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Min"
                                                        name={`${def.key}Min`}
                                                        value={rangeFilters[`${def.key}Min`] ?? ''}
                                                        onChange={handleRangeFilterChange}
                                                    />
                                                    <input
                                                        type="number"
                                                        placeholder="Max"
                                                        name={`${def.key}Max`}
                                                        value={rangeFilters[`${def.key}Max`] ?? ''}
                                                        onChange={handleRangeFilterChange}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    )}

                    {viewMode === 'table' ? (
                    <>
                    <div className="pp-table-wrap">
                    <table className="pp-table">
                        <thead>
                            <tr>
                                <th className="pp-th pp-th-rank">#</th>
                                <PPTh k="scripName" label="Holding" align="left" sticky />
                                {visibleOptional.map(c => <PPTh key={c.key} k={c.key} label={c.short || c.label} align={c.align} />)}
                                <th className="pp-th pp-th-chevron" aria-hidden="true"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedData.map((item, index) => {
                                const it = item as any;
                                const pos = it.positioning || {};
                                const conviction = (pos.conviction || '').toLowerCase();
                                const ticker = it.nseCode || it.bseCode || '';
                                const pledged = !isAnalyst && it.pledgedQty != null && it.pledgedQty > 0;
                                return (
                                    <tr key={`${item.scripName}-${index}`} className="pp-row" onClick={() => handleStockNameClick(item)}>
                                        <td className="pp-rank">{index + 1}</td>
                                        <td className="pp-id-col" title={item.scripName}>
                                            <span className="pp-spine" data-conviction={conviction} />
                                            <div className="pp-id-inner">
                                                <div className="pp-id-name">{item.scripName}</div>
                                                <div className="pp-id-sub">
                                                    {ticker && <span className="pp-ticker">{ticker}</span>}
                                                    {pos.strategyType && <span className="pp-strategy">{pos.strategyType}</span>}
                                                    {pledged && <span className="pp-pledged" title={`Pledged ${it.pledgedQty.toLocaleString('en-IN')}${it.pledgedWhere ? ' · ' + it.pledgedWhere : ''}`}>PLEDGED</span>}
                                                </div>
                                            </div>
                                        </td>
                                        {visibleOptional.map(c => (
                                            <td key={c.key} className={c.align === 'left' ? 'pp-opt-text' : c.align === 'center' ? 'pp-action-col' : 'pp-num'}>{c.cell(it)}</td>
                                        ))}
                                        <td className="pp-chevron" aria-hidden="true">›</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="pp-total-row">
                                <td className="pp-rank"></td>
                                <td className="pp-id-col pp-total-label">Total · {summary.count} holdings</td>
                                {visibleOptional.map(c => (
                                    <td key={c.key} className={c.align === 'left' ? 'pp-opt-text' : c.align === 'center' ? 'pp-action-col' : 'pp-num pp-total-num'}>{c.foot ? c.foot(summary) : ''}</td>
                                ))}
                                <td className="pp-chevron"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                </>
                ) : (
                    <div className="stock-grid">
                        {filteredAndSortedData.map((item, index) => {
                            const gain = (item as any).gainPercentage;
                            const gainColor = gain === null || gain === undefined ? 'inherit' : (gain >= 0 ? 'var(--success-color)' : 'var(--error-color)');
                            const fmtCur = (v: any) => (v !== null && v !== undefined ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : 'N/A');
                            const fmtPct = (v: any) => fmtSignedPct(v === null || v === undefined ? null : Number(v));
                            const pctColor = (v: any) => (v === null || v === undefined ? 'inherit' : (v >= 0 ? 'var(--success-color)' : 'var(--error-color)'));
                            return (
                                <div key={`${item.scripName}-${index}`} className="stock-grid-card">
                                    <div className="stock-grid-card-header">
                                        <span
                                            className="stock-name-clickable"
                                            onClick={() => handleStockNameClick(item)}
                                            title="Click to view/edit remarks"
                                        >
                                            {item.scripName}
                                        </span>
                                        {(item as any).trend && (
                                            <span className={`trend-badge trend-${(item as any).trend.toLowerCase().replace(/\s+/g, '-')}`}>
                                                {(item as any).trend}
                                            </span>
                                        )}
                                    </div>
                                    <div className="stock-grid-price-row">
                                        <span className="stock-grid-price">{fmtCur((item as any).currentPrice)}</span>
                                        <span className="stock-grid-gain" style={{ color: gainColor }}>
                                            {gain !== null && gain !== undefined ? `${gain >= 0 ? '+' : '−'}${Math.abs(gain).toFixed(2)}%` : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="stock-grid-metrics">
                                        {!isAnalyst && (
                                            <>
                                                <div className="stock-grid-metric">
                                                    <span className="stock-grid-metric-label">Qty</span>
                                                    <span className="stock-grid-metric-value">{item.quantity !== null && item.quantity !== undefined ? item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : 'N/A'}</span>
                                                </div>
                                                <div className="stock-grid-metric">
                                                    <span className="stock-grid-metric-label">Value</span>
                                                    <span className="stock-grid-metric-value">{fmtCur((item as any).calculatedAmount)}</span>
                                                </div>
                                            </>
                                        )}
                                        <div className="stock-grid-metric">
                                            <span className="stock-grid-metric-label">Weightage</span>
                                            <span className="stock-grid-metric-value">{(item as any).weightage !== null && (item as any).weightage !== undefined ? `${(item as any).weightage.toFixed(2)}%` : 'N/A'}</span>
                                        </div>
                                        <div className="stock-grid-metric">
                                            <span className="stock-grid-metric-label">Avg Buy</span>
                                            <span className="stock-grid-metric-value">{fmtCur(item.averageBuyPrice)}</span>
                                        </div>
                                        <div className="stock-grid-metric">
                                            <span className="stock-grid-metric-label">P/E</span>
                                            <span className="stock-grid-metric-value">{(item as any).priceToEarning !== null && (item as any).priceToEarning !== undefined ? (item as any).priceToEarning.toFixed(2) : 'N/A'}</span>
                                        </div>
                                        <div className="stock-grid-metric">
                                            <span className="stock-grid-metric-label">1M</span>
                                            <span className="stock-grid-metric-value" style={{ color: pctColor((item as any).return1M) }}>{fmtPct((item as any).return1M)}</span>
                                        </div>
                                        <div className="stock-grid-metric">
                                            <span className="stock-grid-metric-label">1Y</span>
                                            <span className="stock-grid-metric-value" style={{ color: pctColor((item as any).return1Y) }}>{fmtPct((item as any).return1Y)}</span>
                                        </div>
                                    </div>
                                    {(item as any).industry && (
                                        <div className="stock-grid-card-footer">{(item as any).industry}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
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

            {/* Stock Detail Drawer */}
            <StockDetailDrawer
                isOpen={isDrawerOpen}
                onClose={() => {
                    setIsDrawerOpen(false);
                    setSelectedStock(null);
                }}
                stockCode={selectedStock?.code || null}
                stockName={selectedStock?.name || ''}
                positioning={selectedStock?.positioning}
                isAnalyst={isAnalyst}
            />
        </>
    );
};


const AnalysisPage: React.FC<{ gridKeyData: GridKeyData[]; stocks: Stock[]; isAnalyst?: boolean }> = ({ gridKeyData, stocks, isAnalyst = false }) => {
    const [selectedChart, setSelectedChart] = useState<'allocation' | 'performance' | 'growth' | 'sectors' | 'rotation' | 'value' | 'quality' | 'events' | 'themes' | 'deals' | 'factsheet'>('allocation');
    const [portfolioHistory, setPortfolioHistory] = useState<{date: string; value: number; timestamp: number}[]>([]);
    const [metricsHistory, setMetricsHistory] = useState<({ date: string } & PortfolioMetricsSnapshot)[]>([]);

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

    // Load portfolio metrics history (quality-trends chart)
    useEffect(() => {
        const loadMetricsHistory = async () => {
            try {
                const response = await fetch('/api/portfolio-metrics-history');
                if (response.ok) {
                    const data = await response.json();
                    setMetricsHistory(data);
                }
            } catch (error) {
                console.error('Error loading portfolio metrics history:', error);
            }
        };
        loadMetricsHistory();
    }, []);

    // --- Bulk/Block deals state (lifted here so it survives re-renders) ------
    type DealRow = {
        date: string; symbol: string; securityCode?: string; scripName: string;
        clientName: string; buySell: string; quantity: number; price: number;
        dealType: 'bulk' | 'block'; exchange: 'NSE' | 'BSE'; source: string;
    };
    type ExchangeDeals = {
        exchange: 'NSE' | 'BSE';
        source: 'nse' | 'chittorgarh' | 'none';
        sourceLabel: string;
        date: string | null;
        bulk: DealRow[];
        block: DealRow[];
    };
    type DealsResponse = { exchanges: ExchangeDeals[]; attempts: { source: string; ok: boolean; detail: string }[]; error?: string };

    const [dealsData, setDealsData] = useState<DealsResponse | null>(null);
    const [dealsLoading, setDealsLoading] = useState(false);
    const [dealsError, setDealsError] = useState<string | null>(null);
    const [dealsFilterMode, setDealsFilterMode] = useState<'all' | 'filtered'>('all');
    const [dealsPeople, setDealsPeople] = useState<{ include: string[]; exclude: string[] }>({ include: [], exclude: [] });
    const [dealsPipeline, setDealsPipeline] = useState<{ ticker: string; companyName: string }[]>([]);

    // Load pipeline tickers + saved people lists once (used by the deals filter)
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch('/api/pipeline/ideas');
                if (r.ok) {
                    const j = await r.json();
                    const ideas = (j.ideas || []) as { ticker: string; companyName: string }[];
                    setDealsPipeline(ideas.map(i => ({ ticker: i.ticker, companyName: i.companyName })));
                }
            } catch { /* non-fatal */ }
            try {
                const r = await fetch('/api/bulk-deal-people');
                if (r.ok) setDealsPeople(await r.json());
            } catch { /* non-fatal */ }
        })();
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
                                    <span className="bar-value">{isAnalyst ? `${item.percentage.toFixed(1)}%` : `₹${item.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} (${item.percentage.toFixed(1)}%)`}</span>
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

    // Performance Distribution Chart - state for expanded range
    const [expandedRange, setExpandedRange] = useState<string | null>(null);

    const PerformanceChart = () => {
        const [performanceMode, setPerformanceMode] = useState<'alltime' | '1year'>('alltime');

        const ranges: { label: string; min: number; max: number; count: number; stocks: { name: string; gain: number; value: number }[] }[] = [
            { label: '< -20%', min: -Infinity, max: -20, count: 0, stocks: [] },
            { label: '-20% to -10%', min: -20, max: -10, count: 0, stocks: [] },
            { label: '-10% to 0%', min: -10, max: 0, count: 0, stocks: [] },
            { label: '0% to 10%', min: 0, max: 10, count: 0, stocks: [] },
            { label: '10% to 20%', min: 10, max: 20, count: 0, stocks: [] },
            { label: '20% to 50%', min: 20, max: 50, count: 0, stocks: [] },
            { label: '50% to 100%', min: 50, max: 100, count: 0, stocks: [] },
            { label: '> 100%', min: 100, max: Infinity, count: 0, stocks: [] },
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
                if (range) {
                    range.count++;
                    range.stocks.push({
                        name: item.scripName,
                        gain: gain,
                        value: (item as any).calculatedAmount || 0
                    });
                }
            }
        });

        // Sort stocks within each range by gain
        ranges.forEach(range => {
            range.stocks.sort((a, b) => b.gain - a.gain);
        });

        const maxCount = Math.max(...ranges.map(r => r.count));

        const handleBarClick = (label: string) => {
            setExpandedRange(expandedRange === label ? null : label);
        };

        return (
            <div className="chart-card">
                <div className="chart-header">
                    <div>
                        <h3>Gain/Loss Distribution</h3>
                        <p className="chart-subtitle">
                            {performanceMode === 'alltime' ? 'Total returns since purchase' : 'Returns over 1 year period (with fallbacks)'} - Click on a bar to see stocks
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
                        <div key={index} className="bar-item-expandable">
                            <div
                                className={`bar-item clickable ${expandedRange === range.label ? 'expanded' : ''}`}
                                onClick={() => handleBarClick(range.label)}
                            >
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
                                <span className="bar-expand-icon">{expandedRange === range.label ? '▼' : '▶'}</span>
                            </div>
                            {expandedRange === range.label && range.stocks.length > 0 && (
                                <div className="sector-breakdown">
                                    <div className="sector-breakdown-header">
                                        <span className="breakdown-col">Stock</span>
                                        <span className="breakdown-col">Gain %</span>
                                    </div>
                                    {range.stocks.map((stock, i) => (
                                        <div key={i} className="sector-breakdown-row">
                                            <span className="breakdown-stock-name">{stock.name}</span>
                                            <span className={`breakdown-stock-percent ${stock.gain >= 0 ? 'positive' : 'negative'}`}>
                                                {stock.gain >= 0 ? '+' : ''}{stock.gain.toFixed(1)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Growth Metrics Chart - Price Growth vs Profit Growth (4 quadrants)
    const GrowthChart = () => {
        const stocksWithGrowth = enrichedData
            .map(item => {
                // Find matched stock to get return1Y directly (like PerformanceChart does)
                const matchedStock = stocks.find(stock => {
                    if (item.nseCode && stock.nseCode) {
                        return item.nseCode.toLowerCase() === stock.nseCode.toLowerCase();
                    }
                    if (item.bseCode && stock.bseCode) {
                        return item.bseCode.toLowerCase() === stock.bseCode.toLowerCase();
                    }
                    return false;
                });

                const profit = matchedStock?.yoyQuarterlyProfitGrowth;
                const price = matchedStock?.return1Y;

                return {
                    name: item.scripName,
                    profitGrowth: profit ?? 0,
                    priceGrowth: price ?? 0,
                    hasData: (profit != null) || (price != null)
                };
            })
            .filter(item => item.hasData);

        // Cap values between -100 and 100 for plotting
        const cap = (val: number) => Math.max(-100, Math.min(100, val));

        if (stocksWithGrowth.length === 0) {
            return (
                <div className="chart-card">
                    <h3>Price vs Profit Growth</h3>
                    <div className="empty-state">
                        <p>No growth data available. Upload Screener data with profit growth and price return data.</p>
                    </div>
                </div>
            );
        }

        // Chart dimensions: 600x400, with margins for labels
        // Center at (300, 200), range -100 to +100 on both axes
        const chartWidth = 600;
        const chartHeight = 400;
        const margin = { top: 30, right: 30, bottom: 40, left: 50 };
        const plotWidth = chartWidth - margin.left - margin.right;
        const plotHeight = chartHeight - margin.top - margin.bottom;
        const centerX = margin.left + plotWidth / 2;
        const centerY = margin.top + plotHeight / 2;

        // Scale: -100 to +100 maps to plot area
        const scaleX = (val: number) => margin.left + ((cap(val) + 100) / 200) * plotWidth;
        const scaleY = (val: number) => margin.top + plotHeight - ((cap(val) + 100) / 200) * plotHeight;

        // Determine quadrant color for each stock
        const getQuadrantColor = (profit: number, price: number) => {
            if (profit >= 0 && price >= 0) return '#22c55e'; // Q1: Winners (green)
            if (profit < 0 && price >= 0) return '#f59e0b';  // Q2: Price up, profit down (orange)
            if (profit >= 0 && price < 0) return '#3b82f6';  // Q4: Profit up, price down (blue - undervalued?)
            return '#ef4444'; // Q3: Losers (red)
        };

        return (
            <div className="chart-card">
                <h3>Price vs Profit Growth</h3>
                <p className="chart-subtitle">All portfolio stocks - values capped at ±100% for display</p>
                <div className="scatter-chart">
                    <div className="scatter-axis-label-y">Price Growth (1Y) %</div>
                    <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                        {/* Quadrant backgrounds */}
                        <rect x={centerX} y={margin.top} width={plotWidth/2} height={plotHeight/2} fill="#22c55e" opacity="0.05" />
                        <rect x={margin.left} y={margin.top} width={plotWidth/2} height={plotHeight/2} fill="#f59e0b" opacity="0.05" />
                        <rect x={centerX} y={centerY} width={plotWidth/2} height={plotHeight/2} fill="#3b82f6" opacity="0.05" />
                        <rect x={margin.left} y={centerY} width={plotWidth/2} height={plotHeight/2} fill="#ef4444" opacity="0.05" />

                        {/* Grid lines */}
                        {[-100, -50, 0, 50, 100].map(val => (
                            <line key={`h-${val}`} x1={margin.left} x2={chartWidth - margin.right} y1={scaleY(val)} y2={scaleY(val)} stroke="var(--border-color)" strokeWidth={val === 0 ? 2 : 1} strokeDasharray={val === 0 ? "0" : "4,4"} />
                        ))}
                        {[-100, -50, 0, 50, 100].map(val => (
                            <line key={`v-${val}`} x1={scaleX(val)} x2={scaleX(val)} y1={margin.top} y2={chartHeight - margin.bottom} stroke="var(--border-color)" strokeWidth={val === 0 ? 2 : 1} strokeDasharray={val === 0 ? "0" : "4,4"} />
                        ))}

                        {/* Data points */}
                        {stocksWithGrowth.map((stock, index) => {
                            const x = scaleX(stock.profitGrowth);
                            const y = scaleY(stock.priceGrowth);
                            const color = getQuadrantColor(stock.profitGrowth, stock.priceGrowth);
                            return (
                                <circle
                                    key={index}
                                    cx={x}
                                    cy={y}
                                    r="6"
                                    fill={color}
                                    opacity="0.8"
                                    stroke="white"
                                    strokeWidth="1.5"
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={(e) => {
                                        const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                                        setHoveredStock({
                                            name: stock.name,
                                            profitGrowth: stock.profitGrowth,
                                            priceGrowth: stock.priceGrowth,
                                            x: rect ? e.clientX - rect.left : x,
                                            y: rect ? e.clientY - rect.top : y
                                        });
                                    }}
                                    onMouseLeave={() => setHoveredStock(null)}
                                />
                            );
                        })}

                        {/* Axis labels */}
                        {[-100, -50, 0, 50, 100].map(val => (
                            <text key={`y-label-${val}`} x={margin.left - 8} y={scaleY(val) + 4} fontSize="10" fill="var(--secondary-text-color)" textAnchor="end">{val}</text>
                        ))}
                        {[-100, -50, 0, 50, 100].map(val => (
                            <text key={`x-label-${val}`} x={scaleX(val)} y={chartHeight - margin.bottom + 15} fontSize="10" fill="var(--secondary-text-color)" textAnchor="middle">{val}</text>
                        ))}

                        {/* Quadrant labels */}
                        <text x={centerX + plotWidth/4} y={margin.top + 20} fontSize="11" fill="#22c55e" textAnchor="middle" fontWeight="600">Winners</text>
                        <text x={margin.left + plotWidth/4} y={margin.top + 20} fontSize="11" fill="#f59e0b" textAnchor="middle" fontWeight="600">Momentum</text>
                        <text x={centerX + plotWidth/4} y={chartHeight - margin.bottom - 10} fontSize="11" fill="#3b82f6" textAnchor="middle" fontWeight="600">Undervalued?</text>
                        <text x={margin.left + plotWidth/4} y={chartHeight - margin.bottom - 10} fontSize="11" fill="#ef4444" textAnchor="middle" fontWeight="600">Losers</text>
                    </svg>
                    {/* Tooltip on hover */}
                    {hoveredStock && (
                        <div
                            className="scatter-tooltip"
                            style={{
                                left: hoveredStock.x + 10,
                                top: hoveredStock.y - 10
                            }}
                        >
                            <div className="scatter-tooltip-name">{hoveredStock.name}</div>
                            <div className="scatter-tooltip-values">
                                <span>Profit: <strong>{hoveredStock.profitGrowth >= 0 ? '+' : ''}{hoveredStock.profitGrowth.toFixed(1)}%</strong></span>
                                <span>Price: <strong>{hoveredStock.priceGrowth >= 0 ? '+' : ''}{hoveredStock.priceGrowth.toFixed(1)}%</strong></span>
                            </div>
                        </div>
                    )}
                    <div className="scatter-axis-label-x">Profit Growth %</div>
                </div>
{/* Profit Growth Distribution with click to expand */}
                <div className="growth-distribution-single">
                    <div className="growth-distribution-title">Profit Growth Distribution (Click to see stocks)</div>
                    {(() => {
                        const ranges = [
                            { label: '< -20%', min: -Infinity, max: -20, color: '#ef4444' },
                            { label: '-20% to 0%', min: -20, max: 0, color: '#f97316' },
                            { label: '0% to 20%', min: 0, max: 20, color: '#eab308' },
                            { label: '20% to 50%', min: 20, max: 50, color: '#22c55e' },
                            { label: '> 50%', min: 50, max: Infinity, color: '#16a34a' }
                        ];
                        const counts = ranges.map(r => ({
                            ...r,
                            count: stocksWithGrowth.filter(s => s.profitGrowth > r.min && s.profitGrowth <= r.max).length,
                            stocks: stocksWithGrowth.filter(s => s.profitGrowth > r.min && s.profitGrowth <= r.max)
                        }));
                        const maxCount = Math.max(...counts.map(c => c.count), 1);
                        return counts.map((r, i) => (
                            <div key={i} className="bar-item-expandable">
                                <div
                                    className={`growth-dist-row clickable ${expandedProfitRange === r.label ? 'expanded' : ''}`}
                                    onClick={() => setExpandedProfitRange(expandedProfitRange === r.label ? null : r.label)}
                                >
                                    <span className="growth-dist-label">{r.label}</span>
                                    <div className="growth-dist-bar-container">
                                        <div className="growth-dist-bar" style={{ width: `${(r.count / maxCount) * 100}%`, backgroundColor: r.color }}>
                                            {r.count > 0 && <span className="growth-dist-count">{r.count}</span>}
                                        </div>
                                    </div>
                                    <span className="bar-expand-icon">{expandedProfitRange === r.label ? '▼' : '▶'}</span>
                                </div>
                                {expandedProfitRange === r.label && r.stocks.length > 0 && (
                                    <div className="sector-breakdown">
                                        <div className="sector-breakdown-header">
                                            <span className="breakdown-col">Stock</span>
                                            <span className="breakdown-col">Profit Growth</span>
                                            <span className="breakdown-col">Price Growth</span>
                                        </div>
                                        {r.stocks.sort((a, b) => b.profitGrowth - a.profitGrowth).map((stock, idx) => (
                                            <div key={idx} className="sector-breakdown-row">
                                                <span className="breakdown-stock-name">{stock.name}</span>
                                                <span className={`breakdown-stock-percent ${stock.profitGrowth >= 0 ? 'positive' : 'negative'}`}>
                                                    {stock.profitGrowth >= 0 ? '+' : ''}{stock.profitGrowth.toFixed(1)}%
                                                </span>
                                                <span className={`breakdown-stock-percent ${stock.priceGrowth >= 0 ? 'positive' : 'negative'}`}>
                                                    {stock.priceGrowth >= 0 ? '+' : ''}{stock.priceGrowth.toFixed(1)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ));
                    })()}
                </div>
            </div>
        );
    };

    // Growth chart - state for expanded profit growth range and hovered stock
    const [expandedProfitRange, setExpandedProfitRange] = useState<string | null>(null);
    const [hoveredStock, setHoveredStock] = useState<{ name: string; profitGrowth: number; priceGrowth: number; x: number; y: number } | null>(null);

    // Sector Distribution - state for expanded sector
    const [expandedSector, setExpandedSector] = useState<string | null>(null);

    // Themes chart - state for expanded theme and visible themes
    const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
    const [visibleThemes, setVisibleThemes] = useState<Set<string> | null>(null);

    const SectorChart = () => {
        const sectorMap: Record<string, { value: number; stocks: { name: string; value: number; portfolioPercent: number; return1Y: number | null }[] }> = {};
        enrichedData.forEach(item => {
            const sector = (item as any).industry || 'Unknown';
            const value = (item as any).calculatedAmount || 0;
            const stockName = item.scripName || 'Unknown';

            // Find matched stock to get return1Y directly
            const matchedStock = stocks.find(stock => {
                if (item.nseCode && stock.nseCode) {
                    return item.nseCode.toLowerCase() === stock.nseCode.toLowerCase();
                }
                if (item.bseCode && stock.bseCode) {
                    return item.bseCode.toLowerCase() === stock.bseCode.toLowerCase();
                }
                return false;
            });
            const return1Y = matchedStock?.return1Y ?? null;

            if (!sectorMap[sector]) {
                sectorMap[sector] = { value: 0, stocks: [] };
            }
            sectorMap[sector].value += value;
            sectorMap[sector].stocks.push({
                name: stockName,
                value,
                portfolioPercent: totalCurrentAmount > 0 ? (value / totalCurrentAmount) * 100 : 0,
                return1Y
            });
        });

        // Sort stocks by value descending within each sector
        Object.values(sectorMap).forEach(sector => {
            sector.stocks.sort((a, b) => b.value - a.value);
        });

        const sectors = Object.entries(sectorMap)
            .map(([name, data]) => ({
                name,
                value: data.value,
                stocks: data.stocks,
                percentage: totalCurrentAmount > 0 ? (data.value / totalCurrentAmount) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);

        const maxValue = Math.max(...sectors.map(s => s.value));

        const handleBarClick = (sectorName: string) => {
            setExpandedSector(expandedSector === sectorName ? null : sectorName);
        };

        return (
            <div className="chart-card">
                <h3>Industry Allocation</h3>
                <p className="chart-subtitle">Click on a bar to see stock breakdown</p>
                <div className="bar-chart">
                    {sectors.map((sector, index) => (
                        <div key={index} className="bar-item-expandable">
                            <div
                                className={`bar-item clickable ${expandedSector === sector.name ? 'expanded' : ''}`}
                                onClick={() => handleBarClick(sector.name)}
                            >
                                <div className="bar-label">{sector.name}</div>
                                <div className="bar-container">
                                    <div
                                        className="bar-fill"
                                        style={{
                                            width: `${(sector.value / maxValue) * 100}%`,
                                            backgroundColor: `hsl(${index * 30}, 65%, 55%)`
                                        }}
                                    >
                                        <span className="bar-value">{sector.percentage.toFixed(1)}%</span>
                                    </div>
                                </div>
                                <span className="bar-expand-icon">{expandedSector === sector.name ? '▼' : '▶'}</span>
                            </div>
                            {expandedSector === sector.name && (
                                <div className="sector-breakdown">
                                    <div className="sector-breakdown-header">
                                        <span className="breakdown-col">Stock</span>
                                        <span className="breakdown-col">% of Portfolio</span>
                                        <span className="breakdown-col">1Y Return</span>
                                    </div>
                                    {sector.stocks.map((stock, i) => (
                                        <div key={i} className="sector-breakdown-row">
                                            <span className="breakdown-stock-name">{stock.name}</span>
                                            <span className="breakdown-stock-value">{stock.portfolioPercent.toFixed(1)}%</span>
                                            <span className={`breakdown-stock-percent ${stock.return1Y != null ? (stock.return1Y >= 0 ? 'positive' : 'negative') : ''}`}>
                                                {stock.return1Y != null ? `${stock.return1Y >= 0 ? '+' : ''}${Number(stock.return1Y).toFixed(1)}%` : 'N/A'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
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

    const QualityTrendsChart = () => {
        const availableMetrics = PORTFOLIO_METRIC_DEFS.filter(m => !(isAnalyst && m.analystRestricted));
        const [selectedMetric, setSelectedMetric] = useState(availableMetrics[0].key);

        const metricDef = availableMetrics.find(m => m.key === selectedMetric) || availableMetrics[0];

        // Only points where this metric has a value
        const points = metricsHistory
            .map(entry => ({ date: entry.date, value: entry[metricDef.key] as number | null }))
            .filter((p): p is { date: string; value: number } => p.value !== null && !Number.isNaN(p.value));

        if (metricsHistory.length === 0) {
            return (
                <div className="chart-card">
                    <h3>Portfolio Quality Trends</h3>
                    <p className="chart-subtitle">Track weighted-average quality metrics over time</p>
                    <div className="empty-chart-state">
                        <p>No metric history yet. Each time you upload Screener or GridKey data, a snapshot of these metrics is saved — the trend will build up from there.</p>
                    </div>
                </div>
            );
        }

        const svgWidth = 900;
        const svgHeight = 400;
        const padding = 60;
        const chartWidth = svgWidth - 2 * padding;
        const chartHeight = svgHeight - 2 * padding;

        const values = points.map(p => p.value);
        const rawMin = values.length ? Math.min(...values) : 0;
        const rawMax = values.length ? Math.max(...values) : 0;
        // Pad the value range a touch so the line isn't glued to the edges
        const span = rawMax - rawMin;
        const minValue = span === 0 ? rawMin - 1 : rawMin - span * 0.1;
        const maxValue = span === 0 ? rawMax + 1 : rawMax + span * 0.1;
        const valueRange = maxValue - minValue;

        const scaleX = (index: number) =>
            points.length <= 1 ? padding + chartWidth / 2 : padding + (index / (points.length - 1)) * chartWidth;
        const scaleY = (value: number) => {
            if (valueRange === 0) return svgHeight - padding - chartHeight / 2;
            return svgHeight - padding - ((value - minValue) / valueRange) * chartHeight;
        };

        const pathData = points.map((p, index) => {
            const x = scaleX(index);
            const y = scaleY(p.value);
            return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        }).join(' ');

        const fmt = (v: number | null) => formatMetricValue(v, metricDef.format);
        const firstValue = points.length ? points[0].value : null;
        const lastValue = points.length ? points[points.length - 1].value : null;
        const change = (firstValue !== null && lastValue !== null) ? lastValue - firstValue : null;

        const downloadCSV = () => {
            const cols = availableMetrics;
            const csvData = [
                ['Date', ...cols.map(c => c.label)],
                ...metricsHistory.map(entry => [
                    new Date(entry.date).toLocaleDateString('en-IN'),
                    ...cols.map(c => {
                        const v = entry[c.key] as number | null;
                        return v === null || v === undefined ? '' : Number(v).toFixed(2);
                    }),
                ]),
            ];
            const csvContent = csvData.map(row => row.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', 'portfolio_quality_metrics_history.csv');
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
                        <h3>Portfolio Quality Trends</h3>
                        <p className="chart-subtitle">Weighted-average metrics, snapshotted on each data upload</p>
                    </div>
                    <button onClick={downloadCSV} className="download-csv-btn">
                        Download CSV
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0 1rem' }}>
                    <label htmlFor="quality-metric-select" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--secondary-text-color)' }}>Metric:</label>
                    <select
                        id="quality-metric-select"
                        value={selectedMetric}
                        onChange={(e) => setSelectedMetric(e.target.value as typeof selectedMetric)}
                        style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-color)', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                        {availableMetrics.map(m => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                    </select>
                </div>

                <div className="value-summary">
                    <div className="value-stat">
                        <span className="stat-label">Latest:</span>
                        <span className="stat-value">{fmt(lastValue)}</span>
                    </div>
                    <div className="value-stat">
                        <span className="stat-label">Change:</span>
                        <span className="stat-value" style={{ color: change === null ? 'var(--text-color)' : (change >= 0 ? 'var(--success-color)' : 'var(--error-color)') }}>
                            {change === null ? 'N/A' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}`}
                        </span>
                    </div>
                    <div className="value-stat">
                        <span className="stat-label">Snapshots:</span>
                        <span className="stat-value">{points.length}</span>
                    </div>
                </div>

                {points.length === 0 ? (
                    <div className="empty-chart-state">
                        <p>No data for “{metricDef.label}” yet.</p>
                    </div>
                ) : (
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
                                        {value.toFixed(metricDef.format === 'crore' ? 0 : 1)}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Area under line */}
                        <path
                            d={`${pathData} L ${scaleX(points.length - 1)} ${svgHeight - padding} L ${scaleX(0)} ${svgHeight - padding} Z`}
                            fill="var(--accent-color)"
                            opacity="0.1"
                        />

                        {/* Line */}
                        <path d={pathData} stroke="var(--accent-color)" strokeWidth="3" fill="none" />

                        {/* Data points */}
                        {points.map((p, index) => (
                            <circle
                                key={index}
                                cx={scaleX(index)}
                                cy={scaleY(p.value)}
                                r="4"
                                fill="var(--accent-color)"
                                stroke="white"
                                strokeWidth="2"
                            >
                                <title>{`${new Date(p.date).toLocaleDateString('en-IN')}: ${fmt(p.value)}`}</title>
                            </circle>
                        ))}

                        {/* Axis labels */}
                        <text x={svgWidth / 2} y={svgHeight - 10} fontSize="12" fill="var(--text-color)" textAnchor="middle" fontWeight="600">
                            Date
                        </text>
                        <text x={20} y={svgHeight / 2} fontSize="12" fill="var(--text-color)" textAnchor="middle" transform={`rotate(-90 20 ${svgHeight / 2})`} fontWeight="600">
                            {metricDef.label}
                        </text>

                        {/* Date labels */}
                        {points.map((p, index) => {
                            if (points.length <= 10 || index % Math.ceil(points.length / 8) === 0 || index === points.length - 1) {
                                const x = scaleX(index);
                                const dateLabel = new Date(p.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
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
                )}
            </div>
        );
    };

    const ThemesChart = () => {
        // Build theme groups from stocks (which include themes from portfolio API)
        const themeGroups: Record<string, { weightage: number; stocks: { name: string; weightage: number; return1Y: number | null }[] }> = {};
        stocks.forEach(stock => {
            const themes = stock.themes;
            if (!themes || themes.length === 0) return;
            const stockWeightage = (stock as any).weightage as number | null;
            if (!stockWeightage) return;
            themes.forEach(theme => {
                if (!themeGroups[theme]) themeGroups[theme] = { weightage: 0, stocks: [] };
                themeGroups[theme].weightage += stockWeightage;
                themeGroups[theme].stocks.push({ name: stock.name, weightage: stockWeightage, return1Y: stock.return1Y ?? null });
            });
        });

        const allThemes = Object.keys(themeGroups).sort((a, b) => themeGroups[b].weightage - themeGroups[a].weightage);

        // Initialise visibleThemes to all themes on first render
        const currentVisible = visibleThemes ?? new Set(allThemes);

        const handleToggleTheme = (theme: string) => {
            const next = new Set(currentVisible);
            if (next.has(theme)) { next.delete(theme); } else { next.add(theme); }
            setVisibleThemes(next);
        };

        const handleSelectAll = () => setVisibleThemes(new Set(allThemes));
        const handleSelectNone = () => setVisibleThemes(new Set());

        const visibleGroups = allThemes.filter(t => currentVisible.has(t));
        const maxWeightage = visibleGroups.reduce((m, t) => Math.max(m, themeGroups[t].weightage), 0);

        if (allThemes.length === 0) {
            return (
                <div className="chart-card">
                    <h3>Themes Breakdown</h3>
                    <p className="chart-subtitle">No themes assigned yet. Open a stock, go to Positioning, and add themes.</p>
                </div>
            );
        }

        return (
            <div className="chart-card">
                <h3>Themes Breakdown</h3>
                <p className="chart-subtitle">Portfolio allocation by theme (stocks can belong to multiple themes). Click a bar to see holdings.</p>

                {/* Theme checkbox filter panel */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--secondary-text-color)', textTransform: 'uppercase', letterSpacing: '0.3px', marginRight: '0.25rem' }}>Show:</span>
                    {allThemes.map((theme, i) => (
                        <label key={theme} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem 0.5rem', borderRadius: '12px', background: currentVisible.has(theme) ? `hsl(${(i * 47) % 360}, 65%, 92%)` : 'var(--surface-color)', border: '1px solid', borderColor: currentVisible.has(theme) ? `hsl(${(i * 47) % 360}, 55%, 70%)` : 'var(--border-color)', color: currentVisible.has(theme) ? `hsl(${(i * 47) % 360}, 55%, 30%)` : 'var(--secondary-text-color)', transition: 'all 0.15s ease' }}>
                            <input
                                type="checkbox"
                                checked={currentVisible.has(theme)}
                                onChange={() => handleToggleTheme(theme)}
                                style={{ margin: 0, accentColor: `hsl(${(i * 47) % 360}, 65%, 50%)` }}
                            />
                            {theme}
                        </label>
                    ))}
                    <button onClick={handleSelectAll} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--accent-color)', cursor: 'pointer' }}>All</button>
                    <button onClick={handleSelectNone} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--secondary-text-color)', cursor: 'pointer' }}>None</button>
                </div>

                {/* Theme bars */}
                <div className="bar-chart">
                    {visibleGroups.map((theme, index) => {
                        const group = themeGroups[theme];
                        const hue = (allThemes.indexOf(theme) * 47) % 360;
                        const sortedStocks = [...group.stocks].sort((a, b) => b.weightage - a.weightage);
                        return (
                            <div key={theme} className="bar-item-expandable">
                                <div
                                    className={`bar-item clickable ${expandedTheme === theme ? 'expanded' : ''}`}
                                    onClick={() => setExpandedTheme(expandedTheme === theme ? null : theme)}
                                >
                                    <div className="bar-label">{theme}</div>
                                    <div className="bar-container">
                                        <div
                                            className="bar-fill"
                                            style={{ width: maxWeightage > 0 ? `${(group.weightage / maxWeightage) * 100}%` : '0%', backgroundColor: `hsl(${hue}, 65%, 55%)` }}
                                        >
                                            <span className="bar-value">{group.weightage.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <span className="bar-expand-icon">{expandedTheme === theme ? '▼' : '▶'}</span>
                                </div>
                                {expandedTheme === theme && (
                                    <div className="sector-breakdown">
                                        <div className="sector-breakdown-header">
                                            <span className="breakdown-col">Stock</span>
                                            <span className="breakdown-col">% of Portfolio</span>
                                            <span className="breakdown-col">1Y Return</span>
                                        </div>
                                        {sortedStocks.map((s, i) => (
                                            <div key={i} className="sector-breakdown-row">
                                                <span className="breakdown-stock-name">{s.name}</span>
                                                <span className="breakdown-stock-value">{s.weightage.toFixed(1)}%</span>
                                                <span className={`breakdown-stock-percent ${s.return1Y != null ? (s.return1Y >= 0 ? 'positive' : 'negative') : ''}`}>
                                                    {s.return1Y != null ? `${s.return1Y >= 0 ? '+' : ''}${Number(s.return1Y).toFixed(1)}%` : 'N/A'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {visibleGroups.length === 0 && (
                        <p style={{ color: 'var(--secondary-text-color)', fontSize: '0.85rem' }}>No themes selected. Use the checkboxes above to show themes.</p>
                    )}
                </div>
            </div>
        );
    };

    const BulkDealsChart = () => {
        const [includeInput, setIncludeInput] = useState('');
        const [excludeInput, setExcludeInput] = useState('');
        const [savingPerson, setSavingPerson] = useState(false);

        const load = async (mode: 'all' | 'filtered') => {
            setDealsFilterMode(mode);
            setDealsLoading(true);
            setDealsError(null);
            try {
                const response = await fetch('/api/bulk-deals');
                const json = await response.json();
                setDealsData(json);
                if (!response.ok && json?.error) setDealsError(json.error);
            } catch (e: any) {
                setDealsError(e?.message || 'Failed to fetch deals');
            } finally {
                setDealsLoading(false);
            }
        };

        const savePerson = async (method: 'POST' | 'DELETE', listType: 'include' | 'exclude', name: string) => {
            const trimmed = name.trim();
            if (!trimmed) return;
            setSavingPerson(true);
            try {
                const r = await fetch('/api/bulk-deal-people', {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listType, name: trimmed }),
                });
                if (r.ok) setDealsPeople(await r.json());
            } catch { /* ignore */ } finally {
                setSavingPerson(false);
            }
        };

        // --- matching helpers ---
        const normSym = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const normName = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(LIMITED|LIMIT|LTD)$/, '');
        const normPerson = (s?: string) => (s || '').toUpperCase().replace(/\s+/g, ' ').trim();

        // Company set = portfolio (nseCode/bseCode/name) + pipeline (ticker/name, incl. exited)
        const companySymbols = new Set<string>();
        const companyNames = new Set<string>();
        stocks.forEach(s => {
            if (s.nseCode) companySymbols.add(normSym(s.nseCode));
            if (s.bseCode) companySymbols.add(normSym(s.bseCode));
            if (s.name) companyNames.add(normName(s.name));
        });
        dealsPipeline.forEach(p => {
            if (p.ticker) companySymbols.add(normSym(p.ticker));
            if (p.companyName) companyNames.add(normName(p.companyName));
        });
        companySymbols.delete('');
        companyNames.delete('');

        const includeTerms = dealsPeople.include.map(normPerson).filter(p => p.length >= 3);
        const excludeTerms = dealsPeople.exclude.map(normPerson).filter(p => p.length >= 3);

        const companyMatch = (d: DealRow) => {
            if (companySymbols.has(normSym(d.symbol))) return true;
            if (d.securityCode && companySymbols.has(normSym(d.securityCode))) return true;
            const nn = normName(d.scripName);
            return !!nn && companyNames.has(nn);
        };
        const passesFilter = (d: DealRow) => {
            const client = normPerson(d.clientName);
            if (excludeTerms.some(p => client.includes(p))) return false; // exclude wins
            // OR: in one of our companies, OR done by someone on the include list
            return companyMatch(d) || (includeTerms.length > 0 && includeTerms.some(p => client.includes(p)));
        };

        const data = dealsData;
        const loading = dealsLoading;
        const errored = dealsError;
        const filtered = dealsFilterMode === 'filtered';

        const viewEx = (ex: ExchangeDeals): ExchangeDeals => filtered
            ? { ...ex, bulk: ex.bulk.filter(passesFilter), block: ex.block.filter(passesFilter) }
            : ex;

        const isBuy = (s: string) => /buy|^b$/i.test(s.trim());

        const renderTable = (rows: DealRow[], title: string) => (
            <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.5rem' }}>{title} <span style={{ color: 'var(--secondary-text-color)', fontWeight: 400 }}>({rows.length})</span></h4>
                {rows.length === 0 ? (
                    <p className="chart-subtitle" style={{ margin: 0 }}>{filtered ? 'No matching deals for this day.' : 'No deals for this day.'}</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-color)' }}>
                                    <th style={{ padding: '0.4rem 0.6rem' }}>Exch</th>
                                    <th style={{ padding: '0.4rem 0.6rem' }}>Date</th>
                                    <th style={{ padding: '0.4rem 0.6rem' }}>Symbol</th>
                                    <th style={{ padding: '0.4rem 0.6rem' }}>Client</th>
                                    <th style={{ padding: '0.4rem 0.6rem' }}>B/S</th>
                                    <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Quantity</th>
                                    <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '0.4rem 0.6rem' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'var(--pill-bg-color)', color: 'var(--pill-text-color)' }}>{r.exchange}</span>
                                        </td>
                                        <td style={{ padding: '0.4rem 0.6rem', whiteSpace: 'nowrap', color: 'var(--secondary-text-color)' }}>{r.date}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }} title={r.scripName}>{r.symbol || r.scripName}</td>
                                        <td style={{ padding: '0.4rem 0.6rem' }}>{r.clientName}</td>
                                        <td style={{ padding: '0.4rem 0.6rem' }}>
                                            <span className={isBuy(r.buySell) ? 'positive' : 'negative'} style={{ fontWeight: 600 }}>
                                                {isBuy(r.buySell) ? 'BUY' : 'SELL'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>{r.quantity.toLocaleString('en-IN')}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>₹{r.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );

        const renderChips = (listType: 'include' | 'exclude') => (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                {dealsPeople[listType].length === 0 && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--secondary-text-color)' }}>None yet.</span>
                )}
                {dealsPeople[listType].map(name => (
                    <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', padding: '0.2rem 0.5rem', borderRadius: '12px', background: 'var(--pill-bg-color)', color: 'var(--pill-text-color)' }}>
                        {name}
                        <button onClick={() => savePerson('DELETE', listType, name)} disabled={savingPerson} title="Remove"
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--error-color)', fontWeight: 700, padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                ))}
            </div>
        );

        const peopleAdder = (listType: 'include' | 'exclude') => {
            const value = listType === 'include' ? includeInput : excludeInput;
            const setValue = listType === 'include' ? setIncludeInput : setExcludeInput;
            const submit = () => { savePerson('POST', listType, value); setValue(''); };
            return (
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                    <input
                        type="text"
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                        placeholder={`Add a name to ${listType} (e.g. GRAVITON)`}
                        style={{ flex: 1, fontSize: '0.82rem', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--background-color)', color: 'var(--primary-text-color)' }}
                    />
                    <button onClick={submit} disabled={savingPerson || !value.trim()}
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--accent-color)', cursor: 'pointer' }}>Add</button>
                </div>
            );
        };

        // merge both exchanges into one view; block deals only exist for NSE-official
        const viewExchanges = (data?.exchanges || []).map(viewEx);
        const allBulk = viewExchanges.flatMap(e => e.bulk);
        const allBlock = viewExchanges.flatMap(e => e.block);

        return (
            <div className="chart-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>Bulk / Block Deals</h3>
                        <p className="chart-subtitle" style={{ margin: '0.25rem 0 0' }}>
                            Latest trading day (today, else the most recent prior day). <strong>Fetch filtered</strong> = your portfolio + pipeline companies, plus people on your include list, minus excluded people.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => load('all')} disabled={loading}
                            style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--accent-color)', background: !filtered && data ? 'var(--accent-color)' : 'transparent', color: !filtered && data ? '#fff' : 'var(--accent-color)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                            {loading && !filtered ? 'Fetching…' : 'Fetch All'}
                        </button>
                        <button onClick={() => load('filtered')} disabled={loading}
                            style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--accent-color)', background: filtered && data ? 'var(--accent-color)' : 'transparent', color: filtered && data ? '#fff' : 'var(--accent-color)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                            {loading && filtered ? 'Fetching…' : 'Fetch Filtered'}
                        </button>
                    </div>
                </div>

                {/* Filter settings */}
                <details style={{ marginTop: '1rem', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.6rem 0.8rem' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>Filter settings</summary>
                    <p className="chart-subtitle" style={{ margin: '0.6rem 0 0' }}>
                        Companies matched automatically: <strong>{stocks.length}</strong> portfolio + <strong>{dealsPipeline.length}</strong> pipeline (incl. exited).
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '0.8rem' }}>
                        <div>
                            <strong style={{ fontSize: '0.85rem' }}>Include people</strong>
                            <p className="chart-subtitle" style={{ margin: '0.15rem 0 0', fontSize: '0.75rem' }}>Also surface deals by these clients (matched by substring).</p>
                            {renderChips('include')}
                            {peopleAdder('include')}
                        </div>
                        <div>
                            <strong style={{ fontSize: '0.85rem' }}>Exclude people</strong>
                            <p className="chart-subtitle" style={{ margin: '0.15rem 0 0', fontSize: '0.75rem' }}>Always hide deals by these clients.</p>
                            {renderChips('exclude')}
                            {peopleAdder('exclude')}
                        </div>
                    </div>
                </details>

                {/* Source / provenance banner — one row per exchange */}
                {data && (
                    <div style={{ marginTop: '1rem', padding: '0.6rem 0.8rem', borderRadius: '6px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
                        {data.exchanges.map(ex => (
                            <div key={ex.exchange} style={{ marginBottom: '0.2rem' }}>
                                <strong>{ex.exchange} source:</strong>{' '}
                                <span style={{ color: ex.source === 'nse' ? 'var(--success-color)' : ex.source === 'chittorgarh' ? 'var(--accent-color)' : 'var(--error-color)' }}>
                                    {ex.sourceLabel}
                                </span>
                                {ex.date && <span style={{ color: 'var(--secondary-text-color)' }}> — {ex.date}</span>}
                            </div>
                        ))}
                        {filtered && <div style={{ color: 'var(--accent-color)' }}>• showing filtered results</div>}
                        {data.attempts && data.attempts.length > 0 && (
                            <details style={{ marginTop: '0.4rem' }}>
                                <summary style={{ cursor: 'pointer', color: 'var(--secondary-text-color)' }}>Fetch attempts ({data.attempts.length})</summary>
                                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
                                    {data.attempts.map((a, i) => (
                                        <li key={i} style={{ color: a.ok ? 'var(--success-color)' : 'var(--error-color)' }}>
                                            {a.source}: {a.ok ? '✓' : '✗'} {a.detail}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                )}

                {!data && !loading && !errored && (
                    <p className="chart-subtitle" style={{ marginTop: '1rem' }}>Click <strong>Fetch All</strong> or <strong>Fetch Filtered</strong> to load the latest bulk &amp; block deals.</p>
                )}
                {loading && <p className="chart-subtitle" style={{ marginTop: '1rem' }}>Fetching deals…</p>}
                {errored && !loading && (
                    <p style={{ marginTop: '1rem', color: 'var(--error-color)' }}>{errored}</p>
                )}

                {data && !loading && (
                    <>
                        {renderTable(allBulk, 'Bulk Deals (NSE + BSE)')}
                        {renderTable(allBlock, 'Block Deals (NSE)')}
                    </>
                )}
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
                {!isAnalyst && <button className={selectedChart === 'value' ? 'active' : ''} onClick={() => setSelectedChart('value')}>Portfolio Value</button>}
                <button className={selectedChart === 'quality' ? 'active' : ''} onClick={() => setSelectedChart('quality')}>Quality Trends</button>
                <button className={selectedChart === 'events' ? 'active' : ''} onClick={() => setSelectedChart('events')}>Corporate Events</button>
                <button className={selectedChart === 'themes' ? 'active' : ''} onClick={() => setSelectedChart('themes')}>Themes</button>
                <button className={selectedChart === 'deals' ? 'active' : ''} onClick={() => setSelectedChart('deals')}>Bulk/Block Deals</button>
                {!isAnalyst && <button className={selectedChart === 'factsheet' ? 'active' : ''} onClick={() => setSelectedChart('factsheet')}>Factsheet</button>}
            </div>

            <div className="charts-container">
                {selectedChart === 'allocation' && <AllocationChart />}
                {selectedChart === 'performance' && <PerformanceChart />}
                {selectedChart === 'growth' && <GrowthChart />}
                {selectedChart === 'sectors' && <SectorChart />}
                {selectedChart === 'rotation' && <SectorRotationView />}
                {selectedChart === 'value' && <PortfolioValueChart />}
                {selectedChart === 'quality' && <QualityTrendsChart />}
                {selectedChart === 'events' && <CorporateEventsChart />}
                {selectedChart === 'themes' && <ThemesChart />}
                {selectedChart === 'deals' && <BulkDealsChart />}
                {selectedChart === 'factsheet' && <FactsheetPage stocks={stocks} gridKeyData={gridKeyData} portfolioHistory={portfolioHistory} isAnalyst={isAnalyst} />}
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

            const currentPrice = matchedStock?.currentPrice ?? null;
            const dma50 = matchedStock?.dma50 ?? null;
            const dma200 = matchedStock?.dma200 ?? null;
            const return1M = matchedStock?.return1M ?? null;
            const return3M = matchedStock?.return3M ?? null;
            const return1Y = matchedStock?.return1Y ?? null;

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
    const { user, loading: authLoading, logout, isAdmin, isAnalyst, isManager } = useAuth();
    const [page, setPage] = useState<'dashboard' | 'insights' | 'upload' | 'gridkey' | 'analysis' | 'entrydata' | 'pe' | 'pipeline' | 'admin'>('pipeline');
    const [stocks, setStocks] = useState<Stock[]>([]);
    const [gridKeyData, setGridKeyData] = useState<GridKeyData[]>([]);
    const [privateInvestments, setPrivateInvestments] = useState<PrivateInvestments>({ totalInvested: 0, count: 0 });
    const [portfolioHistory, setPortfolioHistory] = useState<{ date: string; value: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [teamMembers, setTeamMembers] = useState<string[]>([]);
    const [smallcapDaily, setSmallcapDaily] = useState<number | null>(null);

    // Nifty Smallcap 100 daily change — the brand-bar benchmark next to today's gain.
    useEffect(() => {
        if (!user) return;
        fetch('/api/nifty-smallcap')
            .then(r => (r.ok ? r.json() : null))
            .then((d: { dailyChange?: number } | null) => {
                if (d && typeof d.dailyChange === 'number') setSmallcapDaily(d.dailyChange);
            })
            .catch(() => {});
    }, [user]);

    // Today's portfolio gain for the brand bar — value-weighted 1-day P&L
    // (value × return1D / (100 + return1D)), mirroring the Dashboard's pnlMetrics.
    const portfolioTotals = useMemo(() => {
        const byCode = new Map<string, { price: number; r1d: number | null }>();
        for (const s of stocks) {
            if (s.currentPrice != null) {
                const entry = { price: s.currentPrice, r1d: s.return1D ?? null };
                if (s.nseCode) byCode.set(s.nseCode.toLowerCase(), entry);
                if (s.bseCode) byCode.set(s.bseCode.toLowerCase(), entry);
            }
        }
        let value = 0, todayGain = 0, hasHoldings = false;
        for (const g of gridKeyData) {
            const e = (g.nseCode ? byCode.get(g.nseCode.toLowerCase()) : undefined)
                ?? (g.bseCode ? byCode.get(g.bseCode.toLowerCase()) : undefined);
            if (g.quantity && e) {
                hasHoldings = true;
                const v = g.quantity * e.price;
                value += v;
                if (e.r1d != null) todayGain += (v * e.r1d) / (100 + e.r1d);
            }
        }
        const prevValue = value - todayGain;
        const todayPercent = prevValue > 0 ? (todayGain / prevValue) * 100 : 0;
        return { todayGain, todayPercent, hasHoldings };
    }, [stocks, gridKeyData]);

    useEffect(() => {
        if (user) {
            fetch('/api/team-members')
                .then(r => r.ok ? r.json() : [])
                .then((data: { id: string; name: string }[]) => setTeamMembers(data.map(m => m.name)))
                .catch(() => {});
        }
    }, [user]);

    useEffect(() => {
        const loadData = async () => {
            if (!user) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // These three requests are independent, so fire them together
                // instead of awaiting each in series (cuts initial load latency).
                const [portfolioResponse, gridKeyResponse, historyResponse] = await Promise.all([
                    fetch('/api/portfolio'),
                    fetch('/api/gridkey'),
                    fetch('/api/portfolio-history'),
                ]);

                if (!portfolioResponse.ok) {
                    throw new Error('Failed to fetch portfolio data');
                }
                setStocks(await portfolioResponse.json());

                // GridKey data and private investments
                if (gridKeyResponse.ok) {
                    const { gridKeyData, privateInvestments: privInv } = await gridKeyResponse.json();
                    setGridKeyData(gridKeyData || []);
                    setPrivateInvestments(privInv || { totalInvested: 0, count: 0 });
                }

                // Portfolio history
                if (historyResponse.ok) {
                    setPortfolioHistory(await historyResponse.json());
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
    }, [user]);

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

    // Helper function to snapshot portfolio-level quality metrics to history.
    // Runs alongside savePortfolioValueToHistory so the Analysis "Quality
    // Trends" chart can plot how these metrics evolve over time.
    const savePortfolioMetricsToHistory = async (
        gridKeyOverride?: GridKeyData[],
        stocksOverride?: Stock[],
    ) => {
        try {
            const metrics = computePortfolioMetricsSnapshot(
                gridKeyOverride ?? gridKeyData,
                stocksOverride ?? stocks,
            );
            await fetch('/api/portfolio-metrics-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metrics })
            });
        } catch (error) {
            console.error('Error saving portfolio metrics history:', error);
            // Don't fail the upload if metrics history save fails
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
                // Snapshot quality metrics using the freshly loaded stock data
                await savePortfolioMetricsToHistory(gridKeyData, fullData);
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

            const result = await response.json().catch(() => ({}));
            const newStocks: { code: string; name: string }[] = result.newStocks || [];
            if (newStocks.length > 0) {
                const list = newStocks.map(s => `• ${s.name} (${s.code})`).join('\n');
                alert(`${newStocks.length} new ${newStocks.length === 1 ? 'company' : 'companies'} added since last upload:\n\n${list}`);
            }

            setGridKeyData(data);
            setPrivateInvestments(privateInv);

            // Save portfolio value to history after gridKey is updated
            await savePortfolioValueToHistory();
            // Snapshot quality metrics using the freshly uploaded holdings
            await savePortfolioMetricsToHistory(data, stocks);

            setTimeout(() => setPage('insights'), 1000);
        } catch (error) {
            console.error('Error saving GridKey data:', error);
            // Still update the UI even if API fails
            setGridKeyData(data);
            setPrivateInvestments(privateInv);
        }
    };

    if (authLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div>Loading...</div>
            </div>
        );
    }

    if (!user) {
        return <LoginPage />;
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div>Loading portfolio data...</div>
            </div>
        );
    }

    // Horizontal nav (DESIGN.md Part II — a left sidebar is banned). Admin is
    // appended neutrally, never tinted (an amber Admin tab reads as an error).
    const navItems = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'insights', label: 'Public Portfolio' },
        { id: 'analysis', label: 'Analysis' },
        ...(isManager ? [
            { id: 'upload', label: 'Screener Data' },
            { id: 'gridkey', label: 'GridKey Data' },
            { id: 'entrydata', label: 'Entry Data' },
        ] : []),
        { id: 'pe', label: 'PE Tracker' },
        { id: 'pipeline', label: 'Pipeline' },
        ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
    ];
    const { todayPercent, hasHoldings } = portfolioTotals;

    return (
        <div className="app-root">
            <header className="topnav">
                <div className="topnav-brand">
                    <img className="topnav-logo" src="/sagun-capital-logo.png" alt="Sagun Capital" />
                </div>
                <nav className="topnav-links">
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            className={`navrow-link ${page === item.id ? 'active' : ''}`}
                            onClick={() => setPage(item.id as any)}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>
                <div className="topnav-right">
                    {hasHoldings && (
                        <div className="brandbar-stat">
                            <span className="brandbar-stat-label">Today's gain</span>
                            <span className="brandbar-stat-num serif n" style={{ color: todayPercent >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                                {fmtSignedPct(todayPercent)}
                            </span>
                        </div>
                    )}
                    {smallcapDaily !== null && (
                        <div className="brandbar-stat brandbar-stat-sep">
                            <span className="brandbar-stat-label">Smallcap 100 today</span>
                            <span className="brandbar-stat-num serif n" style={{ color: smallcapDaily >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                                {fmtSignedPct(smallcapDaily)}
                            </span>
                        </div>
                    )}
                    <div className="brandbar-user brandbar-stat-sep">
                        <span className="brandbar-avatar">{(user.name || '?').charAt(0).toUpperCase()}</span>
                        <div className="brandbar-user-info">
                            <span className="brandbar-user-name">{user.name}</span>
                            <button className="brandbar-logout" onClick={logout}>Sign out</button>
                        </div>
                    </div>
                </div>
            </header>

            <main className={`app-content ${page === 'insights' ? 'is-table-page' : ''}`}>
                {page === 'dashboard' && <Dashboard gridKeyData={gridKeyData} stocks={stocks} privateInvestments={privateInvestments} isAnalyst={isAnalyst} portfolioHistory={portfolioHistory} />}
                {page === 'insights' && <PortfolioInsightsPage gridKeyData={gridKeyData} stocks={stocks} onStocksUpdate={setStocks} isAnalyst={isAnalyst} teamMembers={teamMembers} />}
                {page === 'analysis' && <AnalysisPage gridKeyData={gridKeyData} stocks={stocks} isAnalyst={isAnalyst} />}
                {page === 'upload' && <UploadPage onDataUploaded={handleDataUploaded} />}
                {page === 'gridkey' && <GridKeyPage onGridKeyUploaded={handleGridKeyUploaded} />}
                {page === 'entrydata' && <EntryDataPage gridKeyData={gridKeyData} stocks={stocks} />}
                {page === 'pe' && <PETracker />}
                {page === 'pipeline' && <PipelinePage />}
                {page === 'admin' && <AdminPanel />}
            </main>
        </div>
    );
}

export default App;