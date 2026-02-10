'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Stock, GridKeyData } from '../../types';

interface PrivateInvestments {
    totalInvested: number;
    count: number;
}

interface DashboardProps {
    gridKeyData: GridKeyData[];
    stocks: Stock[];
    privateInvestments: PrivateInvestments;
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

const Dashboard: React.FC<DashboardProps> = ({ gridKeyData, stocks, privateInvestments }) => {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [previousStates, setPreviousStates] = useState<TechnicalState[]>([]);
    const [performersPeriod, setPerformersPeriod] = useState<'daily' | 'yearly'>('daily');

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
                rsi: matchedStock?.rsi || null,
                marketCap: matchedStock?.marketCap || null,
                roce: matchedStock?.roce || null,
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

    // Calculate P&L metrics
    const pnlMetrics = useMemo(() => {
        // Calculate weighted daily, weekly, monthly, yearly P&L
        let dailyPnL = 0;
        let weeklyPnL = 0;
        let monthlyPnL = 0;
        let yearlyPnL = 0;

        enrichedData.forEach(item => {
            const value = item.calculatedAmount || 0;
            if (item.return1D !== null) {
                // P&L for today = value * return1D / (100 + return1D)
                dailyPnL += value * item.return1D / (100 + item.return1D);
            }
            if (item.return1W !== null) {
                weeklyPnL += value * item.return1W / (100 + item.return1W);
            }
            if (item.return1M !== null) {
                monthlyPnL += value * item.return1M / (100 + item.return1M);
            }
            if (item.return1Y !== null) {
                yearlyPnL += value * item.return1Y / (100 + item.return1Y);
            }
        });

        // Calculate percentages
        const previousDayValue = totalCurrentAmount - dailyPnL;
        const dailyPercent = previousDayValue > 0 ? (dailyPnL / previousDayValue) * 100 : 0;

        const previousWeekValue = totalCurrentAmount - weeklyPnL;
        const weeklyPercent = previousWeekValue > 0 ? (weeklyPnL / previousWeekValue) * 100 : 0;

        const previousMonthValue = totalCurrentAmount - monthlyPnL;
        const monthlyPercent = previousMonthValue > 0 ? (monthlyPnL / previousMonthValue) * 100 : 0;

        const previousYearValue = totalCurrentAmount - yearlyPnL;
        const yearlyPercent = previousYearValue > 0 ? (yearlyPnL / previousYearValue) * 100 : 0;

        return {
            dailyPercent,
            weeklyPercent,
            monthlyPercent,
            yearlyPercent,
        };
    }, [enrichedData, totalCurrentAmount]);

    // Count stocks excluding single-share holdings (quantity > 1)
    const stockCount = useMemo(() => {
        return enrichedData.filter(item => item.quantity !== null && item.quantity > 1).length;
    }, [enrichedData]);

    // Calculate weighted averages for portfolio metrics
    const weightedMetrics = useMemo(() => {
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

        // Avg stock value (total value / number of stocks with quantity > 1)
        const stocksWithValue = enrichedData.filter(item => item.quantity !== null && item.quantity > 1 && item.calculatedAmount);
        const avgStockValue = stocksWithValue.length > 0
            ? stocksWithValue.reduce((sum, item) => sum + (item.calculatedAmount || 0), 0) / stocksWithValue.length
            : null;

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
            avgStockValue,
            weightedAllTimeGain: allTimeGainWeight > 0 ? allTimeGainSum / allTimeGainWeight : null,
            weighted1YReturn: return1YWeight > 0 ? return1YSum / return1YWeight : null,
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

        // Winners vs Losers (All-time based on gain %)
        const winnersAllTimeItems = enrichedData.filter(item => item.gainPercentage !== null && item.gainPercentage > 0);
        const losersAllTimeItems = enrichedData.filter(item => item.gainPercentage !== null && item.gainPercentage < 0);
        const winnersAllTime = winnersAllTimeItems.length;
        const losersAllTime = losersAllTimeItems.length;
        const winnersAllTimeWeight = totalCurrentAmount > 0
            ? (winnersAllTimeItems.reduce((sum, item) => sum + (item.calculatedAmount || 0), 0) / totalCurrentAmount) * 100
            : 0;
        const losersAllTimeWeight = totalCurrentAmount > 0
            ? (losersAllTimeItems.reduce((sum, item) => sum + (item.calculatedAmount || 0), 0) / totalCurrentAmount) * 100
            : 0;

        // Winners vs Losers (1 Year based on return1Y)
        const winners1YItems = enrichedData.filter(item => item.return1Y !== null && item.return1Y > 0);
        const losers1YItems = enrichedData.filter(item => item.return1Y !== null && item.return1Y < 0);
        const winners1Y = winners1YItems.length;
        const losers1Y = losers1YItems.length;
        const winners1YWeight = totalCurrentAmount > 0
            ? (winners1YItems.reduce((sum, item) => sum + (item.calculatedAmount || 0), 0) / totalCurrentAmount) * 100
            : 0;
        const losers1YWeight = totalCurrentAmount > 0
            ? (losers1YItems.reduce((sum, item) => sum + (item.calculatedAmount || 0), 0) / totalCurrentAmount) * 100
            : 0;

        return {
            top5Concentration,
            winnersAllTime,
            losersAllTime,
            winnersAllTimeWeight,
            losersAllTimeWeight,
            winners1Y,
            losers1Y,
            winners1YWeight,
            losers1YWeight,
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

    // Portfolio Return Drivers
    const returnDrivers = useMemo(() => {
        const dataWithContribution = enrichedData
            .filter(item => item.calculatedAmount !== null && item.calculatedAmount > 0)
            .map(item => {
                const weightage = totalCurrentAmount > 0
                    ? (item.calculatedAmount! / totalCurrentAmount) * 100
                    : 0;
                // 1Y return with fallback: 1Y → 6M → 3M
                const ytdReturn = item.return1Y ?? item.return6M ?? item.return3M ?? null;
                const portfolioContribution = (ytdReturn !== null && weightage > 0)
                    ? (ytdReturn * weightage) / 100
                    : null;
                return {
                    name: item.scripName,
                    code: item.nseCode || item.bseCode || '',
                    portfolioContribution,
                    weightage,
                    ytdReturn,
                    holdingValue: item.calculatedAmount || 0,
                    isOthers: false,
                };
            })
            .filter(item => item.portfolioContribution !== null);

        if (dataWithContribution.length === 0) {
            return null;
        }

        const sorted = [...dataWithContribution].sort((a, b) =>
            (b.portfolioContribution || 0) - (a.portfolioContribution || 0)
        );

        // Calculate totals
        const portfolioReturn = sorted.reduce((sum, item) => sum + (item.portfolioContribution || 0), 0);
        const top3Contribution = sorted.slice(0, 3).reduce((sum, item) => sum + (item.portfolioContribution || 0), 0);
        const bottom3 = sorted.slice(-3);
        const bottom3Contribution = bottom3.reduce((sum, item) => sum + (item.portfolioContribution || 0), 0);
        const topContributor = sorted[0];
        const excludingTopContributor = portfolioReturn - (topContributor?.portfolioContribution || 0);

        // Separate positive and negative contributors
        const positiveContributors = sorted.filter(item => (item.portfolioContribution || 0) > 0);
        const negativeContributors = sorted.filter(item => (item.portfolioContribution || 0) < 0);

        // Top 5 positive and others
        const topPositive = positiveContributors.slice(0, 5);
        const otherPositive = positiveContributors.slice(5);
        const othersPositiveRow = otherPositive.length > 0 ? {
            name: `Others (${otherPositive.length} stocks)`,
            portfolioContribution: otherPositive.reduce((sum, item) => sum + (item.portfolioContribution || 0), 0),
            isOthers: true,
        } : null;

        // Bottom 4 negative and others
        const bottomNegative = negativeContributors.slice(-4).reverse();
        const otherNegative = negativeContributors.slice(0, -4);
        const othersNegativeRow = otherNegative.length > 0 ? {
            name: `Others (${otherNegative.length} stocks)`,
            portfolioContribution: otherNegative.reduce((sum, item) => sum + (item.portfolioContribution || 0), 0),
            isOthers: true,
        } : null;

        // Build unified list: positives first, then negatives
        const unifiedList: { name: string; portfolioContribution: number; isOthers: boolean; rank?: number }[] = [];
        let rank = 1;

        topPositive.forEach(item => {
            unifiedList.push({ name: item.name, portfolioContribution: item.portfolioContribution || 0, isOthers: false, rank: rank++ });
        });
        if (othersPositiveRow) {
            unifiedList.push(othersPositiveRow);
        }
        bottomNegative.forEach(item => {
            unifiedList.push({ name: item.name, portfolioContribution: item.portfolioContribution || 0, isOthers: false, rank: rank++ });
        });
        if (othersNegativeRow) {
            unifiedList.push(othersNegativeRow);
        }

        // Find max absolute contribution for bar scaling
        const maxAbsContribution = Math.max(
            ...unifiedList.map(item => Math.abs(item.portfolioContribution || 0))
        );

        return {
            portfolioReturn,
            top3Contribution,
            bottom3Contribution,
            topContributor,
            excludingTopContributor,
            unifiedList,
            maxAbsContribution,
            hasData: true,
        };
    }, [enrichedData, totalCurrentAmount]);

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

    // Top and Bottom Performers (Daily and Yearly)
    const performers = useMemo(() => {
        // Daily performers (by return1D)
        const sortedByDaily = [...enrichedData]
            .filter(item => item.return1D !== null)
            .sort((a, b) => (b.return1D || 0) - (a.return1D || 0));

        // Yearly performers (by return1Y)
        const sortedByYearly = [...enrichedData]
            .filter(item => item.return1Y !== null)
            .sort((a, b) => (b.return1Y || 0) - (a.return1Y || 0));

        return {
            topDaily: sortedByDaily.slice(0, 5),
            bottomDaily: sortedByDaily.slice(-5).reverse(),
            topYearly: sortedByYearly.slice(0, 5),
            bottomYearly: sortedByYearly.slice(-5).reverse(),
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
                    </div>
                    <div className="overview-card">
                        <div className="card-label">Invested</div>
                        <div className="card-value">{formatCurrency(totalInvestedAmount)}</div>
                        <div className="card-subtext">{stockCount} stocks</div>
                    </div>
                    {privateInvestments.count > 0 && (
                        <div className="overview-card">
                            <div className="card-label">Private Investments</div>
                            <div className="card-value">{formatCurrency(privateInvestments.totalInvested)}</div>
                            <div className="card-subtext">{privateInvestments.count} stocks</div>
                        </div>
                    )}
                    <div className="overview-card">
                        <div className="card-label">Today</div>
                        <div className={`card-value ${pnlMetrics.dailyPercent >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(pnlMetrics.dailyPercent)}
                        </div>
                    </div>
                    <div className="overview-card">
                        <div className="card-label">Weekly</div>
                        <div className={`card-value ${pnlMetrics.weeklyPercent >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(pnlMetrics.weeklyPercent)}
                        </div>
                    </div>
                    <div className="overview-card">
                        <div className="card-label">Monthly</div>
                        <div className={`card-value ${pnlMetrics.monthlyPercent >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(pnlMetrics.monthlyPercent)}
                        </div>
                    </div>
                    <div className="overview-card">
                        <div className="card-label">Yearly</div>
                        <div className={`card-value ${pnlMetrics.yearlyPercent >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(pnlMetrics.yearlyPercent)}
                        </div>
                    </div>
                </div>
            </section>

            {/* Portfolio Health & Weighted Metrics */}
            <section className="dashboard-section">
                <h2 className="section-title">Portfolio Quality</h2>
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
                        <div className="metric-label">Avg ROCE</div>
                        <div className={`metric-value ${(weightedMetrics.avgROCE || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {weightedMetrics.avgROCE !== null ? formatPercent(weightedMetrics.avgROCE) : 'N/A'}
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
                        <div className="metric-label">Avg Stock Value</div>
                        <div className="metric-value">
                            {weightedMetrics.avgStockValue !== null ? formatCurrency(weightedMetrics.avgStockValue) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Weighted All-time Gain</div>
                        <div className={`metric-value ${(weightedMetrics.weightedAllTimeGain || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {weightedMetrics.weightedAllTimeGain !== null ? formatPercent(weightedMetrics.weightedAllTimeGain) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Weighted 1Y Return</div>
                        <div className={`metric-value ${(weightedMetrics.weighted1YReturn || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {weightedMetrics.weighted1YReturn !== null ? formatPercent(weightedMetrics.weighted1YReturn) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Gain / Loss (All-time)</div>
                        <div className="metric-value">
                            <span className="positive">{healthMetrics.winnersAllTime}</span>
                            {' / '}
                            <span className="negative">{healthMetrics.losersAllTime}</span>
                        </div>
                        <div className="metric-subtext">
                            <span className="positive">{healthMetrics.winnersAllTimeWeight.toFixed(1)}%</span>
                            {' / '}
                            <span className="negative">{healthMetrics.losersAllTimeWeight.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Gain / Loss (1Y)</div>
                        <div className="metric-value">
                            <span className="positive">{healthMetrics.winners1Y}</span>
                            {' / '}
                            <span className="negative">{healthMetrics.losers1Y}</span>
                        </div>
                        <div className="metric-subtext">
                            <span className="positive">{healthMetrics.winners1YWeight.toFixed(1)}%</span>
                            {' / '}
                            <span className="negative">{healthMetrics.losers1YWeight.toFixed(1)}%</span>
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

            {/* Portfolio Return Drivers */}
            <section className="dashboard-section return-drivers-section">
                <div className="return-drivers-header">
                    <h2 className="section-title">Portfolio Return Drivers (1Y)</h2>
                    <p className="section-subtitle">How much did each stock add or drain?</p>
                </div>

                {!returnDrivers ? (
                    <div className="empty-state">No contribution data for this period.</div>
                ) : (
                    <>
                        {/* Summary Strip */}
                        <div className="return-drivers-summary">
                            <div className="summary-item">
                                <span className="summary-label">Portfolio Return</span>
                                <span className={`summary-value ${returnDrivers.portfolioReturn >= 0 ? 'positive' : 'negative'}`}>
                                    {returnDrivers.portfolioReturn >= 0 ? '+' : ''}{returnDrivers.portfolioReturn.toFixed(2)}%
                                </span>
                            </div>
                            <span className="summary-divider">•</span>
                            <div className="summary-item">
                                <span className="summary-label">Top 3 Stocks</span>
                                <span className="summary-value positive">
                                    +{returnDrivers.top3Contribution.toFixed(2)}%
                                </span>
                            </div>
                            <span className="summary-divider">•</span>
                            <div className="summary-item">
                                <span className="summary-label">Bottom 3 Stocks</span>
                                <span className="summary-value negative">
                                    {returnDrivers.bottom3Contribution.toFixed(2)}%
                                </span>
                            </div>
                            <span className="summary-divider">•</span>
                            <div className="summary-item">
                                <span className="summary-label">Top Contributor</span>
                                <span className="summary-value positive">
                                    {returnDrivers.topContributor?.name.substring(0, 15)}{returnDrivers.topContributor?.name.length > 15 ? '...' : ''}: +{(returnDrivers.topContributor?.portfolioContribution || 0).toFixed(2)}%
                                </span>
                            </div>
                        </div>

                        {/* Zero-centered Chart */}
                        <div className="return-drivers-chart">
                            {returnDrivers.unifiedList.map((item, index) => {
                                const contribution = item.portfolioContribution;
                                const isPositive = contribution >= 0;
                                const barWidthPercent = returnDrivers.maxAbsContribution > 0
                                    ? (Math.abs(contribution) / returnDrivers.maxAbsContribution) * 50
                                    : 0;

                                return (
                                    <div key={index} className={`driver-row ${item.isOthers ? 'others-row' : ''}`}>
                                        <div className="driver-info">
                                            {!item.isOthers && <span className="driver-rank">{item.rank}</span>}
                                            <span className={`driver-name ${item.isOthers ? 'muted' : ''}`}>{item.name}</span>
                                        </div>
                                        <div className="driver-bar-area">
                                            <div className="driver-bar-negative">
                                                {!isPositive && (
                                                    <div
                                                        className="driver-bar negative"
                                                        style={{ width: `${barWidthPercent}%` }}
                                                    />
                                                )}
                                            </div>
                                            <div className="driver-zero-line" />
                                            <div className="driver-bar-positive">
                                                {isPositive && (
                                                    <div
                                                        className="driver-bar positive"
                                                        style={{ width: `${barWidthPercent}%` }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                        <div className={`driver-value ${isPositive ? 'positive' : 'negative'}`}>
                                            {isPositive ? '+' : ''}{contribution.toFixed(2)}%
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
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
                <div className="section-header-with-toggle">
                    <h2 className="section-title">Performance Leaderboard</h2>
                    <div className="period-toggle">
                        <button
                            className={`toggle-btn ${performersPeriod === 'daily' ? 'active' : ''}`}
                            onClick={() => setPerformersPeriod('daily')}
                        >
                            Daily
                        </button>
                        <button
                            className={`toggle-btn ${performersPeriod === 'yearly' ? 'active' : ''}`}
                            onClick={() => setPerformersPeriod('yearly')}
                        >
                            1 Year
                        </button>
                    </div>
                </div>
                <div className="leaderboard-grid">
                    <div className="leaderboard-card">
                        <h3 className="leaderboard-title positive">Top 5 {performersPeriod === 'daily' ? 'Today' : 'This Year'}</h3>
                        <div className="leaderboard-list">
                            {(performersPeriod === 'daily' ? performers.topDaily : performers.topYearly).map((item, index) => (
                                <div key={index} className="leaderboard-item">
                                    <span className="leaderboard-rank">{index + 1}</span>
                                    <span className="leaderboard-name">{item.scripName}</span>
                                    <span className={`leaderboard-gain positive`}>
                                        {formatPercent(performersPeriod === 'daily' ? item.return1D : item.return1Y)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="leaderboard-card">
                        <h3 className="leaderboard-title negative">Bottom 5 {performersPeriod === 'daily' ? 'Today' : 'This Year'}</h3>
                        <div className="leaderboard-list">
                            {(performersPeriod === 'daily' ? performers.bottomDaily : performers.bottomYearly).map((item, index) => (
                                <div key={index} className="leaderboard-item">
                                    <span className="leaderboard-rank">{index + 1}</span>
                                    <span className="leaderboard-name">{item.scripName}</span>
                                    <span className={`leaderboard-gain negative`}>
                                        {formatPercent(performersPeriod === 'daily' ? item.return1D : item.return1Y)}
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
