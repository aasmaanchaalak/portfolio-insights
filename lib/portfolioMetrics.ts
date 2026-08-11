/**
 * Shared portfolio-level metric calculations.
 *
 * These weighted-average "quality" metrics are shown live on the Dashboard and
 * are also snapshotted into `portfolio_metrics_history` on every data upload so
 * their evolution can be charted over time on the Analysis page. Keeping the
 * math here ensures the snapshot always matches what the Dashboard displays.
 */

import { Stock, GridKeyData } from '../types';

// Minimal shape needed to compute portfolio metrics. Dashboard's richer
// enrichedData is structurally compatible, so it can be passed in directly.
export interface MetricEnrichedItem {
  calculatedAmount: number | null;
  currentPrice: number | null;
  priceToEarning: number | null;
  yoyQuarterlyProfitGrowth: number | null;
  yoyQuarterlySalesGrowth: number | null;
  marketCap: number | null;
  rsi: number | null;
  roce: number | null;
  dma50: number | null;
  dma200: number | null;
  downFrom52WeekHigh: number | null;
  upFrom52WeekLow: number | null;
  gainPercentage: number | null;
  return1Y: number | null;
}

export interface WeightedMetrics {
  avgPE: number | null;
  avgProfitGrowth: number | null;
  avgSalesGrowth: number | null;
  avgMarketCap: number | null;
  avgRSI: number | null;
  avgROCE: number | null;
  avgDMA50: number | null;
  avgDMA200: number | null;
  avgDownFrom52WH: number | null;
  avgUpFrom52WL: number | null;
  weightedAllTimeGain: number | null;
  weighted1YReturn: number | null;
}

// Flat snapshot persisted to the DB / sent over the API (subset that makes
// sense to trend; excludes rupee-denominated avg stock value).
export interface PortfolioMetricsSnapshot extends WeightedMetrics {
  top5Concentration: number | null;
}

/**
 * Build the per-holding rows needed for metric math by matching GridKey
 * holdings (quantity / buy price) against Screener stock data (fundamentals).
 * Mirrors the enrichment used in Dashboard.tsx and AnalysisPage.
 */
export function enrichForMetrics(
  gridKeyData: GridKeyData[],
  stocks: Stock[]
): MetricEnrichedItem[] {
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
    const calculatedAmount = (item.quantity && currentPrice) ? item.quantity * currentPrice : null;
    const investedAmount = (item.quantity && item.averageBuyPrice) ? item.quantity * item.averageBuyPrice : null;
    const absoluteGain = (calculatedAmount !== null && investedAmount !== null) ? calculatedAmount - investedAmount : null;
    const gainPercentage = (investedAmount !== null && investedAmount !== 0 && absoluteGain !== null)
      ? (absoluteGain / investedAmount) * 100
      : null;

    return {
      calculatedAmount,
      currentPrice,
      gainPercentage,
      priceToEarning: matchedStock?.priceToEarning ?? null,
      yoyQuarterlyProfitGrowth: matchedStock?.yoyQuarterlyProfitGrowth ?? null,
      yoyQuarterlySalesGrowth: matchedStock?.yoyQuarterlySalesGrowth ?? null,
      marketCap: matchedStock?.marketCap ?? null,
      rsi: matchedStock?.rsi ?? null,
      roce: matchedStock?.roce ?? null,
      dma50: matchedStock?.dma50 ?? null,
      dma200: matchedStock?.dma200 ?? null,
      downFrom52WeekHigh: matchedStock?.downFrom52WeekHigh ?? null,
      upFrom52WeekLow: matchedStock?.upFrom52WeekLow ?? null,
      return1Y: matchedStock?.return1Y ?? null,
    };
  });
}

/**
 * Value-weighted averages of the portfolio's quality/technical metrics.
 * Weight for each holding = its current market value (calculatedAmount).
 */
export function computeWeightedMetrics(items: MetricEnrichedItem[]): WeightedMetrics {
  let peSum = 0, peWeight = 0;
  let profitGrowthSum = 0, profitGrowthWeight = 0;
  let salesGrowthSum = 0, salesGrowthWeight = 0;
  let marketCapSum = 0, marketCapWeight = 0;
  let rsiSum = 0, rsiWeight = 0;
  let roceSum = 0, roceWeight = 0;
  let dma50Sum = 0, dma50Weight = 0;
  let dma200Sum = 0, dma200Weight = 0;
  let downFrom52WHSum = 0, downFrom52WHWeight = 0;
  let upFrom52WLSum = 0, upFrom52WLWeight = 0;
  let allTimeGainSum = 0, allTimeGainWeight = 0;
  let return1YSum = 0, return1YWeight = 0;

  items.forEach(item => {
    const weight = item.calculatedAmount || 0;

    if (item.priceToEarning !== null && item.priceToEarning > 0) {
      peSum += item.priceToEarning * weight;
      peWeight += weight;
    }
    if (item.yoyQuarterlyProfitGrowth !== null) {
      profitGrowthSum += item.yoyQuarterlyProfitGrowth * weight;
      profitGrowthWeight += weight;
    }
    if (item.yoyQuarterlySalesGrowth !== null) {
      salesGrowthSum += item.yoyQuarterlySalesGrowth * weight;
      salesGrowthWeight += weight;
    }
    if (item.marketCap !== null) {
      marketCapSum += item.marketCap * weight;
      marketCapWeight += weight;
    }
    if (item.rsi !== null) {
      rsiSum += item.rsi * weight;
      rsiWeight += weight;
    }
    if (item.roce !== null) {
      roceSum += item.roce * weight;
      roceWeight += weight;
    }
    if (item.dma50 !== null && item.currentPrice !== null) {
      const dma50Percent = ((item.currentPrice - item.dma50) / item.dma50) * 100;
      dma50Sum += dma50Percent * weight;
      dma50Weight += weight;
    }
    if (item.dma200 !== null && item.currentPrice !== null) {
      const dma200Percent = ((item.currentPrice - item.dma200) / item.dma200) * 100;
      dma200Sum += dma200Percent * weight;
      dma200Weight += weight;
    }
    if (item.downFrom52WeekHigh !== null) {
      downFrom52WHSum += item.downFrom52WeekHigh * weight;
      downFrom52WHWeight += weight;
    }
    if (item.upFrom52WeekLow !== null) {
      upFrom52WLSum += item.upFrom52WeekLow * weight;
      upFrom52WLWeight += weight;
    }
    if (item.gainPercentage !== null) {
      allTimeGainSum += item.gainPercentage * weight;
      allTimeGainWeight += weight;
    }
    if (item.return1Y !== null) {
      return1YSum += item.return1Y * weight;
      return1YWeight += weight;
    }
  });

  return {
    avgPE: peWeight > 0 ? peSum / peWeight : null,
    avgProfitGrowth: profitGrowthWeight > 0 ? profitGrowthSum / profitGrowthWeight : null,
    avgSalesGrowth: salesGrowthWeight > 0 ? salesGrowthSum / salesGrowthWeight : null,
    avgMarketCap: marketCapWeight > 0 ? marketCapSum / marketCapWeight : null,
    avgRSI: rsiWeight > 0 ? rsiSum / rsiWeight : null,
    avgROCE: roceWeight > 0 ? roceSum / roceWeight : null,
    avgDMA50: dma50Weight > 0 ? dma50Sum / dma50Weight : null,
    avgDMA200: dma200Weight > 0 ? dma200Sum / dma200Weight : null,
    avgDownFrom52WH: downFrom52WHWeight > 0 ? downFrom52WHSum / downFrom52WHWeight : null,
    avgUpFrom52WL: upFrom52WLWeight > 0 ? upFrom52WLSum / upFrom52WLWeight : null,
    weightedAllTimeGain: allTimeGainWeight > 0 ? allTimeGainSum / allTimeGainWeight : null,
    weighted1YReturn: return1YWeight > 0 ? return1YSum / return1YWeight : null,
  };
}

/** Share of total portfolio value held in the top 5 holdings (%). */
export function computeTop5Concentration(items: MetricEnrichedItem[]): number | null {
  const total = items.reduce((sum, item) => sum + (item.calculatedAmount || 0), 0);
  if (total <= 0) return null;
  const top5 = [...items]
    .filter(item => item.calculatedAmount !== null)
    .sort((a, b) => (b.calculatedAmount || 0) - (a.calculatedAmount || 0))
    .slice(0, 5)
    .reduce((sum, item) => sum + (item.calculatedAmount || 0), 0);
  return (top5 / total) * 100;
}

/** Compute the full snapshot stored in portfolio_metrics_history. */
export function computePortfolioMetricsSnapshot(
  gridKeyData: GridKeyData[],
  stocks: Stock[]
): PortfolioMetricsSnapshot {
  const enriched = enrichForMetrics(gridKeyData, stocks);
  return {
    ...computeWeightedMetrics(enriched),
    top5Concentration: computeTop5Concentration(enriched),
  };
}

export type MetricFormat = 'percent' | 'number' | 'crore';

export interface MetricDef {
  key: keyof PortfolioMetricsSnapshot;
  label: string;
  format: MetricFormat;
  /** Hidden from analysts (rupee-denominated). */
  analystRestricted?: boolean;
}

// Order here is the order shown in the chart's metric dropdown.
export const PORTFOLIO_METRIC_DEFS: MetricDef[] = [
  { key: 'avgROCE', label: 'Avg ROCE', format: 'percent' },
  { key: 'avgRSI', label: 'Avg RSI', format: 'number' },
  { key: 'avgProfitGrowth', label: 'Avg Profit Growth (YoY Quarterly)', format: 'percent' },
  { key: 'avgSalesGrowth', label: 'Avg Sales Growth (YoY Quarterly)', format: 'percent' },
  { key: 'avgPE', label: 'Weighted Avg P/E', format: 'number' },
  { key: 'avgMarketCap', label: 'Avg Market Cap (₹ Cr)', format: 'crore', analystRestricted: true },
  { key: 'avgDMA50', label: 'Avg vs 50 DMA', format: 'percent' },
  { key: 'avgDMA200', label: 'Avg vs 200 DMA', format: 'percent' },
  { key: 'avgDownFrom52WH', label: 'Avg Down from 52W High', format: 'percent' },
  { key: 'avgUpFrom52WL', label: 'Avg Up from 52W Low', format: 'percent' },
  { key: 'weightedAllTimeGain', label: 'Weighted All-time Gain', format: 'percent' },
  { key: 'weighted1YReturn', label: 'Weighted 1Y Return', format: 'percent' },
  { key: 'top5Concentration', label: 'Top 5 Concentration', format: 'percent' },
];

export function formatMetricValue(value: number | null, format: MetricFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  switch (format) {
    case 'percent':
      return `${value >= 0 ? '' : ''}${value.toFixed(1)}%`;
    case 'crore':
      return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
    case 'number':
    default:
      return value.toFixed(1);
  }
}
