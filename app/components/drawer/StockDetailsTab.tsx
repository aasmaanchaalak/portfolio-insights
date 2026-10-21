'use client';

import React from 'react';
interface StockDetailsTabProps {
  stockCode: string | null;
  stockName: string;
  // Computed row from the Portfolio Insights table. When present it's used as-is,
  // since /api/portfolio only has the raw Screener fields.
  holding?: any;
  forwardIrrLabels?: string[];
  isAnalyst: boolean;
}

function fmt(val: any, prefix = '', suffix = '', decimals = 2): string {
  if (val === null || val === undefined) return 'N/A';
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(n)) return String(val);
  return `${prefix}${n.toLocaleString('en-IN', { maximumFractionDigits: decimals })}${suffix}`;
}

function pct(val: any): string {
  if (val === null || val === undefined) return 'N/A';
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(n)) return 'N/A';
  return `${n.toFixed(2)}%`;
}

function color(val: any): string | undefined {
  if (val === null || val === undefined) return undefined;
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(n)) return undefined;
  return n >= 0 ? 'var(--positive-color, #22c55e)' : 'var(--negative-color, #ef4444)';
}

interface Row {
  label: string;
  value: string;
  color?: string;
  analystHidden?: boolean;
}

interface Section {
  title: string;
  rows: Row[];
}

export function StockDetailsTab({ stockCode, stockName, holding, forwardIrrLabels = [], isAnalyst }: StockDetailsTabProps) {
  const [fetched, setFetched] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(!holding);
  const data = holding || fetched;

  React.useEffect(() => {
    if (!stockCode || holding) return;
    setLoading(true);
    // Re-use the main portfolio endpoint and find this stock
    fetch('/api/portfolio')
      .then(r => r.json())
      .then(json => {
        const stocks: any[] = json.stocks || json || [];
        const match = stocks.find((s: any) =>
          s.nseCode === stockCode || s.bseCode === stockCode
        );
        setFetched(match || null);
      })
      .catch(() => setFetched(null))
      .finally(() => setLoading(false));
  }, [stockCode, !!holding]);

  if (loading) return <div className="stock-details-loading">Loading...</div>;
  if (!data) return <div className="stock-details-loading">No data found for {stockName}.</div>;

  const sections: Section[] = [
    {
      title: 'Position',
      rows: [
        { label: 'Quantity', value: fmt(data.quantity, '', ' shares', 0), analystHidden: true },
        { label: 'Avg Buy Price', value: fmt(data.averageBuyPrice, '₹') },
        { label: 'Current Price', value: fmt(data.currentPrice, '₹') },
        { label: 'Invested Amount', value: fmt(data.investedAmount, '₹'), analystHidden: true },
        { label: 'Current Value', value: fmt(data.calculatedAmount, '₹'), analystHidden: true },
        { label: 'Absolute Gain', value: fmt(data.absoluteGain, '₹'), color: color(data.absoluteGain), analystHidden: true },
        { label: 'Gain %', value: pct(data.gainPercentage), color: color(data.gainPercentage) },
        { label: 'Weightage %', value: pct(data.weightage) },
        { label: 'Portfolio Contribution %', value: pct(data.portfolioContribution), color: color(data.portfolioContribution) },
        { label: 'Entry Date', value: data.entryDate ? new Date(data.entryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A' },
        { label: 'Entry Price', value: fmt(data.entryPrice, '₹') },
        { label: 'Pledged Qty', value: fmt(data.pledgedQty, '', '', 0), analystHidden: true },
        { label: 'Free Qty', value: fmt(data.freeQty, '', '', 0), analystHidden: true },
        { label: 'Pledged Where', value: data.pledgedWhere || 'N/A', analystHidden: true },
      ],
    },
    {
      title: 'Returns',
      rows: [
        { label: '1 Day', value: pct(data.return1D), color: color(data.return1D) },
        { label: '1 Week', value: pct(data.return1W), color: color(data.return1W) },
        { label: '1 Month', value: pct(data.return1M), color: color(data.return1M) },
        { label: '3 Months', value: pct(data.return3M), color: color(data.return3M) },
        { label: '6 Months', value: pct(data.return6M), color: color(data.return6M) },
        { label: '1 Year', value: pct(data.return1Y), color: color(data.return1Y) },
        { label: 'IRR', value: pct(data.irr), color: color(data.irr) },
        ...forwardIrrLabels.map((label, i) => ({ label, value: pct(data[`fwdIrr${i}`]), color: color(data[`fwdIrr${i}`]) })),
      ],
    },
    {
      title: 'Fundamentals',
      rows: [
        { label: 'Industry', value: data.industry || 'N/A' },
        { label: 'Industry Group', value: data.industryGroup || 'N/A' },
        { label: 'Market Cap', value: fmt(data.marketCap, '₹', ' Cr', 0) },
        { label: '% of Mcap', value: data.positionPctOfMarketCap == null ? 'N/A' : `${data.positionPctOfMarketCap.toFixed(data.positionPctOfMarketCap < 0.01 ? 4 : 2)}%` },
        { label: 'P/E', value: fmt(data.priceToEarning) },
        { label: 'ROCE %', value: pct(data.roce) },
        { label: 'Profit Growth %', value: pct(data.yoyQuarterlyProfitGrowth), color: color(data.yoyQuarterlyProfitGrowth) },
        { label: 'Sales Growth %', value: pct(data.yoyQuarterlySalesGrowth), color: color(data.yoyQuarterlySalesGrowth) },
        { label: 'RSI', value: fmt(data.rsi) },
      ],
    },
    {
      title: 'Technicals',
      rows: [
        { label: 'vs 50 DMA', value: pct(data.dma50ChangePercent), color: color(data.dma50ChangePercent) },
        { label: 'vs 200 DMA', value: pct(data.dma200ChangePercent), color: color(data.dma200ChangePercent) },
        { label: 'Down from 52W High', value: pct(data.downFrom52WeekHigh), color: color(data.downFrom52WeekHigh) },
        { label: 'Up from 52W Low', value: pct(data.upFrom52WeekLow), color: color(data.upFrom52WeekLow) },
        { label: 'Trend', value: data.trend || 'N/A' },
      ],
    },
    {
      title: 'Workflow',
      rows: [
        { label: 'Positioning', value: data.positioning?.actionIntent || 'N/A' },
        { label: 'Bucket', value: data.bucket || 'N/A' },
        { label: 'Assigned To', value: data.assignedTo || 'N/A' },
        { label: 'Remarks', value: data.remarks || 'N/A' },
      ],
    },
  ];

  return (
    <div className="stock-details-tab">
      {sections.map(section => {
        const visibleRows = section.rows.filter(r => !(isAnalyst && r.analystHidden));
        if (visibleRows.length === 0) return null;
        return (
          <div key={section.title} className="stock-details-section">
            <div className="stock-details-section-title">{section.title}</div>
            <div className="stock-details-grid">
              {visibleRows.map(row => (
                <div key={row.label} className="stock-details-row">
                  <span className="stock-details-label">{row.label}</span>
                  <span className="stock-details-value" style={row.color ? { color: row.color } : undefined}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
