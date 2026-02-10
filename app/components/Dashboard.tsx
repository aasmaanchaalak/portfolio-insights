'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Stock, GridKeyData } from '../../types';

interface DashboardProps {
    gridKeyData: GridKeyData[];
    stocks: Stock[];
}

interface TechnicalState {
    stockCode: string;
    stockName: string;
    above50DMA: boolean;
    above200DMA: boolean;
    dma50Above200: boolean; // for golden/death cross
    near52WeekHigh: boolean;
    near52WeekLow: boolean;
}

interface Alert {
    id: string;
    stockCode: string;
    stockName: string;
    alertType: 'CROSSED_BELOW_50DMA' | 'CROSSED_ABOVE_50DMA' | 'CROSSED_BELOW_200DMA' | 'CROSSED_ABOVE_200DMA' | 'DEATH_CROSS' | 'GOLDEN_CROSS' | 'NEAR_52W_HIGH' | 'NEAR_52W_LOW' | 'WEAK_PROFIT_GROWTH' | 'WEAK_SALES_GROWTH';
    message: string;
    currentPrice: number;
    thresholdValue: number;
    changePercent: number;
    triggeredAt: string;
    isRead: boolean;
}

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

const formatCurrency = (value: number | null): string => {
    if (value === null) return 'N/A';
    return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const formatPercent = (value: number | null, decimals: number = 2): string => {
    if (value === null) return 'N/A';
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

const Dashboard: React.FC<DashboardProps> = ({ gridKeyData, stocks }) => {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [previousStates, setPreviousStates] = useState<TechnicalState[]>([]);

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
                dma50: matchedStock?.dma50 || null,
                dma200: matchedStock?.dma200 || null,
                downFrom52WeekHigh: matchedStock?.downFrom52WeekHigh || null,
                upFrom52WeekLow: matchedStock?.upFrom52WeekLow || null,
                return1D: matchedStock?.return1D || null,
                return1W: matchedStock?.return1W || null,
                return1M: matchedStock?.return1M || null,
                return3M: matchedStock?.return3M || null,
                return6M: matchedStock?.return6M || null,
                return1Y: matchedStock?.return1Y || null,
                // Placeholder fields for data not yet available
                rsi: null as number | null, // RSI not in current data
                marketCap: null as number | null, // Market cap not in current data
            };
        });
    }, [gridKeyData, stocks]);

    // Calculate totals
    const totalCurrentAmount = useMemo(() => {
        return enrichedData.reduce((total, item) => total + (item.calculatedAmount || 0), 0);
    }, [enrichedData]);

    const totalInvestedAmount = useMemo(() => {
        return enrichedData.reduce((total, item) => total + (item.investedAmount || 0), 0);
    }, [enrichedData]);

    const totalAbsoluteGain = totalCurrentAmount - totalInvestedAmount;
    const totalGainPercentage = totalInvestedAmount > 0 ? (totalAbsoluteGain / totalInvestedAmount) * 100 : 0;

    // Calculate today's P&L using weighted 1D returns
    const todaysPnL = useMemo(() => {
        let weightedReturn = 0;
        enrichedData.forEach(item => {
            if (item.calculatedAmount && item.return1D !== null) {
                const weight = item.calculatedAmount / totalCurrentAmount;
                weightedReturn += item.return1D * weight;
            }
        });
        return {
            percent: weightedReturn,
            amount: (weightedReturn / 100) * totalCurrentAmount
        };
    }, [enrichedData, totalCurrentAmount]);

    // Calculate weekly P&L
    const weeklyPnL = useMemo(() => {
        let weightedReturn = 0;
        enrichedData.forEach(item => {
            if (item.calculatedAmount && item.return1W !== null) {
                const weight = item.calculatedAmount / totalCurrentAmount;
                weightedReturn += item.return1W * weight;
            }
        });
        return weightedReturn;
    }, [enrichedData, totalCurrentAmount]);

    // Calculate monthly P&L
    const monthlyPnL = useMemo(() => {
        let weightedReturn = 0;
        enrichedData.forEach(item => {
            if (item.calculatedAmount && item.return1M !== null) {
                const weight = item.calculatedAmount / totalCurrentAmount;
                weightedReturn += item.return1M * weight;
            }
        });
        return weightedReturn;
    }, [enrichedData, totalCurrentAmount]);

    // Calculate weighted averages for portfolio metrics
    const weightedMetrics = useMemo(() => {
        let peSum = 0, peWeight = 0;
        let profitGrowthSum = 0, profitGrowthWeight = 0;
        let salesGrowthSum = 0, salesGrowthWeight = 0;
        let marketCapSum = 0, marketCapWeight = 0;
        let rsiSum = 0, rsiWeight = 0;
        let dma50Sum = 0, dma50Weight = 0;
        let dma200Sum = 0, dma200Weight = 0;
        let downFrom52WHSum = 0, downFrom52WHWeight = 0;
        let upFrom52WLSum = 0, upFrom52WLWeight = 0;

        enrichedData.forEach(item => {
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
        });

        return {
            avgPE: peWeight > 0 ? peSum / peWeight : null,
            avgProfitGrowth: profitGrowthWeight > 0 ? profitGrowthSum / profitGrowthWeight : null,
            avgSalesGrowth: salesGrowthWeight > 0 ? salesGrowthSum / salesGrowthWeight : null,
            avgMarketCap: marketCapWeight > 0 ? marketCapSum / marketCapWeight : null,
            avgRSI: rsiWeight > 0 ? rsiSum / rsiWeight : null,
            avgDMA50: dma50Weight > 0 ? dma50Sum / dma50Weight : null,
            avgDMA200: dma200Weight > 0 ? dma200Sum / dma200Weight : null,
            avgDownFrom52WH: downFrom52WHWeight > 0 ? downFrom52WHSum / downFrom52WHWeight : null,
            avgUpFrom52WL: upFrom52WLWeight > 0 ? upFrom52WLSum / upFrom52WLWeight : null,
        };
    }, [enrichedData]);

    // Portfolio Health Metrics
    const healthMetrics = useMemo(() => {
        // Top 5 concentration
        const sortedByValue = [...enrichedData]
            .filter(item => item.calculatedAmount !== null)
            .sort((a, b) => (b.calculatedAmount || 0) - (a.calculatedAmount || 0));

        const top5Value = sortedByValue.slice(0, 5).reduce((sum, item) => sum + (item.calculatedAmount || 0), 0);
        const top5Concentration = totalCurrentAmount > 0 ? (top5Value / totalCurrentAmount) * 100 : 0;

        // Sector concentration
        const sectorMap: Record<string, number> = {};
        enrichedData.forEach(item => {
            const sector = item.industryGroup || 'Unknown';
            sectorMap[sector] = (sectorMap[sector] || 0) + (item.calculatedAmount || 0);
        });
        const largestSector = Object.entries(sectorMap).sort((a, b) => b[1] - a[1])[0];
        const largestSectorPercent = totalCurrentAmount > 0 && largestSector
            ? (largestSector[1] / totalCurrentAmount) * 100
            : 0;

        // Winners vs Losers
        const winners = enrichedData.filter(item => item.gainPercentage !== null && item.gainPercentage > 0).length;
        const losers = enrichedData.filter(item => item.gainPercentage !== null && item.gainPercentage < 0).length;

        return {
            top5Concentration,
            largestSector: largestSector ? largestSector[0] : 'N/A',
            largestSectorPercent,
            winners,
            losers,
            totalStocks: enrichedData.length,
        };
    }, [enrichedData, totalCurrentAmount]);

    // Generate technical alerts
    const technicalAlerts = useMemo(() => {
        const newAlerts: Alert[] = [];
        const today = new Date().toISOString().split('T')[0];

        enrichedData.forEach(item => {
            const stockCode = item.nseCode || item.bseCode || '';
            const stockName = item.scripName;
            const currentPrice = item.currentPrice;
            const dma50 = item.dma50;
            const dma200 = item.dma200;
            const downFrom52WH = item.downFrom52WeekHigh;
            const upFrom52WL = item.upFrom52WeekLow;
            const return1D = item.return1D;

            if (!currentPrice || !stockCode) return;

            // Below 50 DMA
            if (dma50 !== null && currentPrice < dma50) {
                const changePercent = ((currentPrice - dma50) / dma50) * 100;
                newAlerts.push({
                    id: `${stockCode}-below-50dma`,
                    stockCode,
                    stockName,
                    alertType: 'CROSSED_BELOW_50DMA',
                    message: `Trading below 50 DMA`,
                    currentPrice,
                    thresholdValue: dma50,
                    changePercent,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Below 200 DMA
            if (dma200 !== null && currentPrice < dma200) {
                const changePercent = ((currentPrice - dma200) / dma200) * 100;
                newAlerts.push({
                    id: `${stockCode}-below-200dma`,
                    stockCode,
                    stockName,
                    alertType: 'CROSSED_BELOW_200DMA',
                    message: `Trading below 200 DMA`,
                    currentPrice,
                    thresholdValue: dma200,
                    changePercent,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Death Cross (50 DMA below 200 DMA)
            if (dma50 !== null && dma200 !== null && dma50 < dma200) {
                newAlerts.push({
                    id: `${stockCode}-death-cross`,
                    stockCode,
                    stockName,
                    alertType: 'DEATH_CROSS',
                    message: `Death Cross: 50 DMA below 200 DMA`,
                    currentPrice,
                    thresholdValue: dma200,
                    changePercent: ((dma50 - dma200) / dma200) * 100,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Golden Cross (50 DMA above 200 DMA)
            if (dma50 !== null && dma200 !== null && dma50 > dma200) {
                newAlerts.push({
                    id: `${stockCode}-golden-cross`,
                    stockCode,
                    stockName,
                    alertType: 'GOLDEN_CROSS',
                    message: `Golden Cross: 50 DMA above 200 DMA`,
                    currentPrice,
                    thresholdValue: dma200,
                    changePercent: ((dma50 - dma200) / dma200) * 100,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Near 52-week high (within 5%)
            if (downFrom52WH !== null && downFrom52WH <= 5 && downFrom52WH >= 0) {
                newAlerts.push({
                    id: `${stockCode}-near-52w-high`,
                    stockCode,
                    stockName,
                    alertType: 'NEAR_52W_HIGH',
                    message: `Near 52-week high (${downFrom52WH.toFixed(1)}% away)`,
                    currentPrice,
                    thresholdValue: currentPrice * (1 + downFrom52WH / 100),
                    changePercent: -downFrom52WH,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Near 52-week low (within 10%)
            if (upFrom52WL !== null && upFrom52WL <= 10 && upFrom52WL >= 0) {
                newAlerts.push({
                    id: `${stockCode}-near-52w-low`,
                    stockCode,
                    stockName,
                    alertType: 'NEAR_52W_LOW',
                    message: `Near 52-week low (${upFrom52WL.toFixed(1)}% above)`,
                    currentPrice,
                    thresholdValue: currentPrice / (1 + upFrom52WL / 100),
                    changePercent: upFrom52WL,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Weak quarterly results - Profit Growth < 15%
            const profitGrowth = item.yoyQuarterlyProfitGrowth;
            if (profitGrowth !== null && profitGrowth < 15) {
                newAlerts.push({
                    id: `${stockCode}-weak-profit-growth`,
                    stockCode,
                    stockName,
                    alertType: 'WEAK_PROFIT_GROWTH',
                    message: `Weak profit growth: ${profitGrowth.toFixed(1)}% (below 15%)`,
                    currentPrice,
                    thresholdValue: 15,
                    changePercent: profitGrowth,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Weak quarterly results - Sales Growth < 15%
            const salesGrowth = item.yoyQuarterlySalesGrowth;
            if (salesGrowth !== null && salesGrowth < 15) {
                newAlerts.push({
                    id: `${stockCode}-weak-sales-growth`,
                    stockCode,
                    stockName,
                    alertType: 'WEAK_SALES_GROWTH',
                    message: `Weak sales growth: ${salesGrowth.toFixed(1)}% (below 15%)`,
                    currentPrice,
                    thresholdValue: 15,
                    changePercent: salesGrowth,
                    triggeredAt: today,
                    isRead: false,
                });
            }
        });

        return newAlerts;
    }, [enrichedData]);

    // Categorize alerts
    const categorizedAlerts = useMemo(() => {
        const critical = technicalAlerts.filter(a =>
            ['DEATH_CROSS', 'CROSSED_BELOW_200DMA'].includes(a.alertType)
        );
        const high = technicalAlerts.filter(a =>
            ['CROSSED_BELOW_50DMA', 'NEAR_52W_LOW'].includes(a.alertType)
        );
        const medium = technicalAlerts.filter(a =>
            ['CROSSED_ABOVE_50DMA', 'CROSSED_ABOVE_200DMA', 'GOLDEN_CROSS'].includes(a.alertType)
        );
        const info = technicalAlerts.filter(a =>
            ['NEAR_52W_HIGH'].includes(a.alertType)
        );
        // Fundamental alerts - weak quarterly results
        const fundamental = technicalAlerts.filter(a =>
            ['WEAK_PROFIT_GROWTH', 'WEAK_SALES_GROWTH'].includes(a.alertType)
        );

        return { critical, high, medium, info, fundamental };
    }, [technicalAlerts]);

    // Gain/Loss Distribution
    const gainLossDistribution = useMemo(() => {
        const ranges = [
            { label: '< -20%', min: -Infinity, max: -20, count: 0, color: '#dc2626' },
            { label: '-20% to -10%', min: -20, max: -10, count: 0, color: '#ef4444' },
            { label: '-10% to 0%', min: -10, max: 0, count: 0, color: '#f87171' },
            { label: '0% to 10%', min: 0, max: 10, count: 0, color: '#86efac' },
            { label: '10% to 20%', min: 10, max: 20, count: 0, color: '#4ade80' },
            { label: '20% to 50%', min: 20, max: 50, count: 0, color: '#22c55e' },
            { label: '> 50%', min: 50, max: Infinity, count: 0, color: '#16a34a' },
        ];

        enrichedData.forEach(item => {
            if (item.gainPercentage !== null) {
                const range = ranges.find(r => item.gainPercentage! >= r.min && item.gainPercentage! < r.max);
                if (range) range.count++;
            }
        });

        return ranges;
    }, [enrichedData]);

    // Sector Performance - Top 5 Gainers and Losers
    const sectorPerformance = useMemo(() => {
        const sectorMap: Record<string, {
            return1M: number[],
            return3M: number[],
            totalValue: number,
            count: number
        }> = {};

        enrichedData.forEach(item => {
            const sector = item.industry || item.industryGroup || 'Unknown';
            if (!sectorMap[sector]) {
                sectorMap[sector] = { return1M: [], return3M: [], totalValue: 0, count: 0 };
            }
            if (item.return1M !== null) sectorMap[sector].return1M.push(item.return1M);
            if (item.return3M !== null) sectorMap[sector].return3M.push(item.return3M);
            sectorMap[sector].totalValue += item.calculatedAmount || 0;
            sectorMap[sector].count++;
        });

        const sectorData = Object.entries(sectorMap)
            .filter(([_, data]) => data.return1M.length > 0)
            .map(([sector, data]) => ({
                sector,
                avgReturn1M: data.return1M.reduce((a, b) => a + b, 0) / data.return1M.length,
                avgReturn3M: data.return3M.length > 0
                    ? data.return3M.reduce((a, b) => a + b, 0) / data.return3M.length
                    : null,
                totalValue: data.totalValue,
                count: data.count,
            }))
            .sort((a, b) => b.avgReturn1M - a.avgReturn1M);

        return {
            topGainers: sectorData.slice(0, 5),
            topLosers: sectorData.slice(-5).reverse(),
        };
    }, [enrichedData]);

    // Top and Bottom Performers
    const performers = useMemo(() => {
        const sortedByGain = [...enrichedData]
            .filter(item => item.gainPercentage !== null)
            .sort((a, b) => (b.gainPercentage || 0) - (a.gainPercentage || 0));

        return {
            topPerformers: sortedByGain.slice(0, 5),
            bottomPerformers: sortedByGain.slice(-5).reverse(),
        };
    }, [enrichedData]);

    // Technical Status Table Data
    const technicalStatusData = useMemo(() => {
        return enrichedData
            .filter(item => item.currentPrice !== null)
            .map(item => {
                const vs50DMA = item.dma50 !== null && item.currentPrice !== null
                    ? ((item.currentPrice - item.dma50) / item.dma50) * 100
                    : null;
                const vs200DMA = item.dma200 !== null && item.currentPrice !== null
                    ? ((item.currentPrice - item.dma200) / item.dma200) * 100
                    : null;

                return {
                    name: item.scripName,
                    code: item.nseCode || item.bseCode || '',
                    price: item.currentPrice,
                    vs50DMA,
                    vs200DMA,
                    downFrom52WH: item.downFrom52WeekHigh,
                    upFrom52WL: item.upFrom52WeekLow,
                    rsi: item.rsi,
                    return1D: item.return1D,
                };
            })
            .sort((a, b) => (a.vs50DMA || 0) - (b.vs50DMA || 0));
    }, [enrichedData]);

    const getAlertIcon = (type: string) => {
        if (type.includes('BELOW') || type.includes('DEATH') || type.includes('LOW')) {
            return '🔴';
        }
        if (type.includes('ABOVE') || type.includes('GOLDEN') || type.includes('HIGH')) {
            return '🟢';
        }
        if (type.includes('WEAK')) {
            return '🟠';
        }
        return '🟡';
    };

    const getAlertPriorityClass = (type: string) => {
        if (['DEATH_CROSS', 'CROSSED_BELOW_200DMA'].includes(type)) return 'alert-critical';
        if (['CROSSED_BELOW_50DMA', 'NEAR_52W_LOW'].includes(type)) return 'alert-high';
        if (['GOLDEN_CROSS', 'CROSSED_ABOVE_50DMA', 'CROSSED_ABOVE_200DMA'].includes(type)) return 'alert-positive';
        if (['WEAK_PROFIT_GROWTH', 'WEAK_SALES_GROWTH'].includes(type)) return 'alert-fundamental';
        return 'alert-info';
    };

    return (
        <div className="dashboard-page">
            {/* Portfolio Overview Cards */}
            <section className="dashboard-section">
                <h2 className="section-title">Portfolio Overview</h2>
                <div className="overview-cards">
                    <div className="overview-card">
                        <div className="card-label">Total Value</div>
                        <div className="card-value">{formatCurrency(totalCurrentAmount)}</div>
                        <div className={`card-change ${todaysPnL.percent >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(todaysPnL.percent)} ({formatCurrency(todaysPnL.amount)}) today
                        </div>
                    </div>
                    <div className="overview-card">
                        <div className="card-label">Invested</div>
                        <div className="card-value">{formatCurrency(totalInvestedAmount)}</div>
                        <div className="card-subtext">{enrichedData.length} stocks</div>
                    </div>
                    <div className="overview-card">
                        <div className="card-label">Total Gain/Loss</div>
                        <div className={`card-value ${totalAbsoluteGain >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(totalAbsoluteGain)}
                        </div>
                        <div className={`card-change ${totalGainPercentage >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(totalGainPercentage)} all-time
                        </div>
                    </div>
                    <div className="overview-card">
                        <div className="card-label">Today's P&L</div>
                        <div className={`card-value ${todaysPnL.percent >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(todaysPnL.amount)}
                        </div>
                        <div className={`card-change ${todaysPnL.percent >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(todaysPnL.percent)}
                        </div>
                    </div>
                    <div className="overview-card">
                        <div className="card-label">This Week</div>
                        <div className={`card-value ${weeklyPnL >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(weeklyPnL)}
                        </div>
                        <div className="card-subtext">1W weighted return</div>
                    </div>
                    <div className="overview-card">
                        <div className="card-label">This Month</div>
                        <div className={`card-value ${monthlyPnL >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(monthlyPnL)}
                        </div>
                        <div className="card-subtext">1M weighted return</div>
                    </div>
                </div>
            </section>

            {/* Portfolio Health & Weighted Metrics */}
            <section className="dashboard-section">
                <h2 className="section-title">Portfolio Metrics</h2>
                <div className="metrics-grid">
                    <div className="metric-card">
                        <div className="metric-label">Weighted Avg P/E</div>
                        <div className="metric-value">
                            {weightedMetrics.avgPE !== null ? weightedMetrics.avgPE.toFixed(2) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Avg Profit Growth</div>
                        <div className={`metric-value ${(weightedMetrics.avgProfitGrowth || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {weightedMetrics.avgProfitGrowth !== null ? formatPercent(weightedMetrics.avgProfitGrowth) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Avg Sales Growth</div>
                        <div className={`metric-value ${(weightedMetrics.avgSalesGrowth || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {weightedMetrics.avgSalesGrowth !== null ? formatPercent(weightedMetrics.avgSalesGrowth) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Avg vs 50 DMA</div>
                        <div className={`metric-value ${(weightedMetrics.avgDMA50 || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {weightedMetrics.avgDMA50 !== null ? formatPercent(weightedMetrics.avgDMA50) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Avg vs 200 DMA</div>
                        <div className={`metric-value ${(weightedMetrics.avgDMA200 || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {weightedMetrics.avgDMA200 !== null ? formatPercent(weightedMetrics.avgDMA200) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Down from 52W High</div>
                        <div className="metric-value negative">
                            {weightedMetrics.avgDownFrom52WH !== null ? `-${weightedMetrics.avgDownFrom52WH.toFixed(1)}%` : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Up from 52W Low</div>
                        <div className="metric-value positive">
                            {weightedMetrics.avgUpFrom52WL !== null ? `+${weightedMetrics.avgUpFrom52WL.toFixed(1)}%` : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Avg RSI</div>
                        <div className="metric-value">
                            {weightedMetrics.avgRSI !== null ? weightedMetrics.avgRSI.toFixed(1) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Avg Market Cap</div>
                        <div className="metric-value">
                            {weightedMetrics.avgMarketCap !== null ? formatCurrency(weightedMetrics.avgMarketCap) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Top 5 Concentration</div>
                        <div className={`metric-value ${healthMetrics.top5Concentration > 50 ? 'warning' : ''}`}>
                            {healthMetrics.top5Concentration.toFixed(1)}%
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Largest Sector</div>
                        <div className="metric-value-small">{healthMetrics.largestSector}</div>
                        <div className="metric-subvalue">{healthMetrics.largestSectorPercent.toFixed(1)}%</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Winners vs Losers</div>
                        <div className="metric-value">
                            <span className="positive">{healthMetrics.winners}</span>
                            {' / '}
                            <span className="negative">{healthMetrics.losers}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Technical Alerts */}
            <section className="dashboard-section">
                <h2 className="section-title">
                    Technical Alerts
                    <span className="alert-count">({technicalAlerts.length})</span>
                </h2>

                {technicalAlerts.length === 0 ? (
                    <div className="empty-alerts">No alerts at this time</div>
                ) : (
                    <div className="alerts-container">
                        {/* Critical Alerts */}
                        {categorizedAlerts.critical.length > 0 && (
                            <div className="alert-group">
                                <h3 className="alert-group-title critical">Critical ({categorizedAlerts.critical.length})</h3>
                                <div className="alerts-list">
                                    {categorizedAlerts.critical.map(alert => (
                                        <div key={alert.id} className={`alert-item ${getAlertPriorityClass(alert.alertType)}`}>
                                            <span className="alert-icon">{getAlertIcon(alert.alertType)}</span>
                                            <div className="alert-content">
                                                <div className="alert-stock">{alert.stockName}</div>
                                                <div className="alert-message">{alert.message}</div>
                                            </div>
                                            <div className="alert-details">
                                                <div className="alert-price">₹{alert.currentPrice.toFixed(2)}</div>
                                                <div className={`alert-change ${alert.changePercent >= 0 ? 'positive' : 'negative'}`}>
                                                    {formatPercent(alert.changePercent)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* High Priority Alerts */}
                        {categorizedAlerts.high.length > 0 && (
                            <div className="alert-group">
                                <h3 className="alert-group-title high">High Priority ({categorizedAlerts.high.length})</h3>
                                <div className="alerts-list">
                                    {categorizedAlerts.high.map(alert => (
                                        <div key={alert.id} className={`alert-item ${getAlertPriorityClass(alert.alertType)}`}>
                                            <span className="alert-icon">{getAlertIcon(alert.alertType)}</span>
                                            <div className="alert-content">
                                                <div className="alert-stock">{alert.stockName}</div>
                                                <div className="alert-message">{alert.message}</div>
                                            </div>
                                            <div className="alert-details">
                                                <div className="alert-price">₹{alert.currentPrice.toFixed(2)}</div>
                                                <div className={`alert-change ${alert.changePercent >= 0 ? 'positive' : 'negative'}`}>
                                                    {formatPercent(alert.changePercent)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Positive Alerts */}
                        {categorizedAlerts.medium.length > 0 && (
                            <div className="alert-group">
                                <h3 className="alert-group-title positive">Positive Signals ({categorizedAlerts.medium.length})</h3>
                                <div className="alerts-list">
                                    {categorizedAlerts.medium.map(alert => (
                                        <div key={alert.id} className={`alert-item ${getAlertPriorityClass(alert.alertType)}`}>
                                            <span className="alert-icon">{getAlertIcon(alert.alertType)}</span>
                                            <div className="alert-content">
                                                <div className="alert-stock">{alert.stockName}</div>
                                                <div className="alert-message">{alert.message}</div>
                                            </div>
                                            <div className="alert-details">
                                                <div className="alert-price">₹{alert.currentPrice.toFixed(2)}</div>
                                                <div className={`alert-change ${alert.changePercent >= 0 ? 'positive' : 'negative'}`}>
                                                    {formatPercent(alert.changePercent)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Info Alerts */}
                        {categorizedAlerts.info.length > 0 && (
                            <div className="alert-group">
                                <h3 className="alert-group-title info">Info ({categorizedAlerts.info.length})</h3>
                                <div className="alerts-list">
                                    {categorizedAlerts.info.map(alert => (
                                        <div key={alert.id} className={`alert-item ${getAlertPriorityClass(alert.alertType)}`}>
                                            <span className="alert-icon">{getAlertIcon(alert.alertType)}</span>
                                            <div className="alert-content">
                                                <div className="alert-stock">{alert.stockName}</div>
                                                <div className="alert-message">{alert.message}</div>
                                            </div>
                                            <div className="alert-details">
                                                <div className="alert-price">₹{alert.currentPrice.toFixed(2)}</div>
                                                <div className={`alert-change ${alert.changePercent >= 0 ? 'positive' : 'negative'}`}>
                                                    {formatPercent(alert.changePercent)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Fundamental Alerts - Weak Quarterly Results */}
                        {categorizedAlerts.fundamental.length > 0 && (
                            <div className="alert-group">
                                <h3 className="alert-group-title fundamental">Weak Quarterly Results ({categorizedAlerts.fundamental.length})</h3>
                                <div className="alerts-list">
                                    {categorizedAlerts.fundamental.map(alert => (
                                        <div key={alert.id} className={`alert-item ${getAlertPriorityClass(alert.alertType)}`}>
                                            <span className="alert-icon">{getAlertIcon(alert.alertType)}</span>
                                            <div className="alert-content">
                                                <div className="alert-stock">{alert.stockName}</div>
                                                <div className="alert-message">{alert.message}</div>
                                            </div>
                                            <div className="alert-details">
                                                <div className="alert-price">₹{alert.currentPrice.toFixed(2)}</div>
                                                <div className={`alert-change ${alert.changePercent >= 0 ? 'positive' : 'negative'}`}>
                                                    {formatPercent(alert.changePercent)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* Gain/Loss Distribution */}
            <section className="dashboard-section">
                <h2 className="section-title">Gain/Loss Distribution</h2>
                <div className="distribution-chart">
                    {gainLossDistribution.map((range, index) => {
                        const maxCount = Math.max(...gainLossDistribution.map(r => r.count));
                        const width = maxCount > 0 ? (range.count / maxCount) * 100 : 0;
                        return (
                            <div key={index} className="distribution-bar-item">
                                <div className="distribution-label">{range.label}</div>
                                <div className="distribution-bar-container">
                                    <div
                                        className="distribution-bar-fill"
                                        style={{
                                            width: `${width}%`,
                                            backgroundColor: range.color
                                        }}
                                    >
                                        <span className="distribution-count">{range.count} stocks</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Sector Rotation - Top Gainers & Losers */}
            <section className="dashboard-section">
                <h2 className="section-title">Sector Performance</h2>
                <div className="sector-performance-grid">
                    <div className="sector-list-card">
                        <h3 className="sector-list-title positive">Top 5 Gaining Sectors (1M)</h3>
                        <div className="sector-list">
                            {sectorPerformance.topGainers.map((sector, index) => (
                                <div key={index} className="sector-list-item">
                                    <span className="sector-rank">{index + 1}</span>
                                    <span className="sector-name">{sector.sector}</span>
                                    <span className="sector-count">({sector.count} stocks)</span>
                                    <span className={`sector-return ${sector.avgReturn1M >= 0 ? 'positive' : 'negative'}`}>
                                        {formatPercent(sector.avgReturn1M)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="sector-list-card">
                        <h3 className="sector-list-title negative">Bottom 5 Sectors (1M)</h3>
                        <div className="sector-list">
                            {sectorPerformance.topLosers.map((sector, index) => (
                                <div key={index} className="sector-list-item">
                                    <span className="sector-rank">{index + 1}</span>
                                    <span className="sector-name">{sector.sector}</span>
                                    <span className="sector-count">({sector.count} stocks)</span>
                                    <span className={`sector-return ${sector.avgReturn1M >= 0 ? 'positive' : 'negative'}`}>
                                        {formatPercent(sector.avgReturn1M)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Performance Leaderboard */}
            <section className="dashboard-section">
                <h2 className="section-title">Performance Leaderboard</h2>
                <div className="leaderboard-grid">
                    <div className="leaderboard-card">
                        <h3 className="leaderboard-title positive">Top 5 Performers</h3>
                        <div className="leaderboard-list">
                            {performers.topPerformers.map((item, index) => (
                                <div key={index} className="leaderboard-item">
                                    <span className="leaderboard-rank">{index + 1}</span>
                                    <span className="leaderboard-name">{item.scripName}</span>
                                    <span className={`leaderboard-gain positive`}>
                                        {formatPercent(item.gainPercentage)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="leaderboard-card">
                        <h3 className="leaderboard-title negative">Bottom 5 Performers</h3>
                        <div className="leaderboard-list">
                            {performers.bottomPerformers.map((item, index) => (
                                <div key={index} className="leaderboard-item">
                                    <span className="leaderboard-rank">{index + 1}</span>
                                    <span className="leaderboard-name">{item.scripName}</span>
                                    <span className={`leaderboard-gain negative`}>
                                        {formatPercent(item.gainPercentage)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Technical Status Table */}
            <section className="dashboard-section">
                <h2 className="section-title">Technical Status</h2>
                <div className="technical-table-container">
                    <table className="technical-table">
                        <thead>
                            <tr>
                                <th>Stock</th>
                                <th>Price</th>
                                <th>vs 50 DMA</th>
                                <th>vs 200 DMA</th>
                                <th>From 52W High</th>
                                <th>From 52W Low</th>
                                <th>RSI</th>
                                <th>1D Return</th>
                            </tr>
                        </thead>
                        <tbody>
                            {technicalStatusData.slice(0, 20).map((item, index) => (
                                <tr key={index}>
                                    <td className="stock-name-cell">{item.name}</td>
                                    <td>₹{item.price?.toFixed(2) || 'N/A'}</td>
                                    <td className={item.vs50DMA !== null ? (item.vs50DMA >= 0 ? 'positive' : 'negative') : ''}>
                                        {item.vs50DMA !== null ? formatPercent(item.vs50DMA) : 'N/A'}
                                    </td>
                                    <td className={item.vs200DMA !== null ? (item.vs200DMA >= 0 ? 'positive' : 'negative') : ''}>
                                        {item.vs200DMA !== null ? formatPercent(item.vs200DMA) : 'N/A'}
                                    </td>
                                    <td className="negative">
                                        {item.downFrom52WH !== null ? `-${item.downFrom52WH.toFixed(1)}%` : 'N/A'}
                                    </td>
                                    <td className="positive">
                                        {item.upFrom52WL !== null ? `+${item.upFrom52WL.toFixed(1)}%` : 'N/A'}
                                    </td>
                                    <td>{item.rsi !== null ? item.rsi.toFixed(1) : 'N/A'}</td>
                                    <td className={item.return1D !== null ? (item.return1D >= 0 ? 'positive' : 'negative') : ''}>
                                        {item.return1D !== null ? formatPercent(item.return1D) : 'N/A'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
