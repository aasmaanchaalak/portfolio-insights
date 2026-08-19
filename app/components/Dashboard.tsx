'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Stock, GridKeyData } from '../../types';
import { PEFactsheetSummary } from '../../types/pe';
import {
  CONVICTION_LABELS,
  STRATEGY_LABELS,
  ACTION_LABELS,
  ALL_CONVICTIONS,
  ALL_STRATEGIES,
  ALL_ACTIONS,
} from '../../types/positioning';
import './positioning/positioning.css';

interface PrivateInvestments {
    totalInvested: number;
    count: number;
}

interface DashboardProps {
    gridKeyData: GridKeyData[];
    stocks: Stock[];
    privateInvestments: PrivateInvestments;
    isAnalyst?: boolean;
    portfolioHistory: { date: string; value: number }[];
}

interface TechnicalState {
    stockCode: string;
    stockName: string;
    above50DMA: boolean;
    above200DMA: boolean;
    dma50Above200: boolean; // for golden/death cross
    near52WeekHigh: boolean;
    near52WeekLow: boolean;
    belowCost: boolean; // current price below average buy price
    profitGrowthAbove15: boolean;
    salesGrowthAbove15: boolean;
    timestamp?: string;
}

interface Alert {
    id: string;
    stockCode: string;
    stockName: string;
    alertType: 'CROSSED_BELOW_50DMA' | 'CROSSED_ABOVE_50DMA' | 'CROSSED_BELOW_200DMA' | 'CROSSED_ABOVE_200DMA' | 'DEATH_CROSS' | 'GOLDEN_CROSS' | 'NEAR_52W_HIGH' | 'NEAR_52W_LOW' | 'CROSSED_BELOW_COST' | 'WEAK_PROFIT_GROWTH' | 'WEAK_SALES_GROWTH' | 'PROFIT_GROWTH_DROPPED' | 'PROFIT_GROWTH_RECOVERED' | 'SALES_GROWTH_DROPPED' | 'SALES_GROWTH_RECOVERED';
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

// Headline portfolio figures (Public Value, Private Investments) shown in whole
// lakhs, no crore roll-up and no decimals — e.g. "₹631 L".
const formatLakhs = (value: number | null): string => {
    if (value === null) return 'N/A';
    return `₹${(value / 100000).toLocaleString('en-IN', { maximumFractionDigits: 0 })} L`;
};

const formatPercent = (value: number | null, decimals: number = 2): string => {
    if (value === null) return 'N/A';
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

interface NiftySmallcapData {
    lastPrice: number;
    dailyChange: number;
    weeklyChange: number;
    monthlyChange: number;
    yearlyChange: number;
    pe: number | null;
    lastUpdated: string;
}

const Dashboard: React.FC<DashboardProps> = ({ gridKeyData, stocks, privateInvestments, isAnalyst = false, portfolioHistory }) => {
    const [previousStates, setPreviousStates] = useState<TechnicalState[]>([]);
    const [transitionAlerts, setTransitionAlerts] = useState<Alert[]>([]);
    const [storedAlerts, setStoredAlerts] = useState<Alert[]>([]);
    const [performersPeriod, setPerformersPeriod] = useState<'daily' | 'yearly'>('daily');
    const [driverPeriod, setDriverPeriod] = useState<'1D' | '1M' | '3M' | '6M' | '1Y' | 'ALL'>('1D');
    const [statesLoaded, setStatesLoaded] = useState(false);
    const [alertsLoaded, setAlertsLoaded] = useState(false);
    const [niftySmallcap, setNiftySmallcap] = useState<NiftySmallcapData | null>(null);
    const [peSummary, setPeSummary] = useState<PEFactsheetSummary | null>(null);
    const [positioningData, setPositioningData] = useState<Record<string, { conviction: string; strategyType: string; actionIntent: string }>>({});
    const [ytdReturn, setYtdReturn] = useState<{ pct: number; startValue: number; latestValue: number; startDate: string } | null>(null);
    const [alertsRefreshIn, setAlertsRefreshIn] = useState<string>('');
    const hasProcessedStates = useRef(false);
    const scrollPositionRef = useRef(0);

    // Preserve scroll position on visibility change
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Save scroll position when tab becomes hidden
                scrollPositionRef.current = window.scrollY;
            } else {
                // Restore scroll position when tab becomes visible
                requestAnimationFrame(() => {
                    window.scrollTo(0, scrollPositionRef.current);
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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
                entryDate: matchedStock?.entryDate || null,
                entryPrice: matchedStock?.entryPrice || null,
            };
        });
    }, [gridKeyData, stocks]);

    // Compute current technical states
    const currentStates = useMemo((): TechnicalState[] => {
        return enrichedData
            .filter(item => item.currentPrice !== null)
            .map(item => {
                const stockCode = item.nseCode || item.bseCode || '';
                const currentPrice = item.currentPrice!;
                const dma50 = item.dma50;
                const dma200 = item.dma200;
                const avgBuyPrice = item.averageBuyPrice;
                const downFrom52WH = item.downFrom52WeekHigh;
                const upFrom52WL = item.upFrom52WeekLow;
                const profitGrowth = item.yoyQuarterlyProfitGrowth;
                const salesGrowth = item.yoyQuarterlySalesGrowth;

                return {
                    stockCode,
                    stockName: item.scripName,
                    above50DMA: dma50 !== null ? currentPrice > dma50 : false,
                    above200DMA: dma200 !== null ? currentPrice > dma200 : false,
                    dma50Above200: (dma50 !== null && dma200 !== null) ? dma50 > dma200 : false,
                    near52WeekHigh: downFrom52WH !== null ? downFrom52WH <= 5 : false,
                    near52WeekLow: upFrom52WL !== null ? upFrom52WL <= 10 : false,
                    belowCost: (avgBuyPrice !== null && avgBuyPrice !== undefined && avgBuyPrice > 0) ? currentPrice < avgBuyPrice : false,
                    profitGrowthAbove15: profitGrowth !== null ? profitGrowth >= 15 : false,
                    salesGrowthAbove15: salesGrowth !== null ? salesGrowth >= 15 : false,
                    timestamp: new Date().toISOString(),
                };
            });
    }, [enrichedData]);

    // Load previous states from Redis on mount
    useEffect(() => {
        const loadPreviousStates = async () => {
            try {
                const response = await fetch('/api/technical-states');
                if (response.ok) {
                    const states = await response.json();
                    setPreviousStates(states);
                }
            } catch (error) {
                console.error('Error loading technical states:', error);
            } finally {
                setStatesLoaded(true);
            }
        };
        loadPreviousStates();
    }, []);

    // Load stored alerts from Redis on mount
    useEffect(() => {
        const loadStoredAlerts = async () => {
            try {
                const response = await fetch('/api/alerts');
                if (response.ok) {
                    const alerts = await response.json();
                    setStoredAlerts(alerts);
                }
            } catch (error) {
                console.error('Error loading stored alerts:', error);
            } finally {
                setAlertsLoaded(true);
            }
        };
        loadStoredAlerts();
    }, []);

    // Load Nifty Smallcap data on mount
    useEffect(() => {
        const loadNiftySmallcap = async () => {
            try {
                const response = await fetch('/api/nifty-smallcap');
                if (response.ok) {
                    const data = await response.json();
                    setNiftySmallcap(data);
                }
            } catch (error) {
                console.error('Error loading Nifty Smallcap data:', error);
            }
        };
        loadNiftySmallcap();
        // Private book current value comes from the PE tracker (current NAV of held companies)
        fetch('/api/pe/factsheet-summary')
            .then(r => (r.ok ? r.json() : null))
            .then(d => d && setPeSummary(d))
            .catch(err => console.error('Error loading PE summary:', err));
    }, []);

    // Load positioning data on mount
    useEffect(() => {
        const loadPositioning = async () => {
            try {
                const response = await fetch('/api/positioning');
                if (response.ok) {
                    const data = await response.json();
                    setPositioningData(data);
                }
            } catch (error) {
                console.error('Error loading positioning data:', error);
            }
        };
        loadPositioning();
    }, []);

    // YTD return computed directly from portfolioHistory prop (no extra fetch)
    useEffect(() => {
        if (portfolioHistory.length < 2) return;
        const now = new Date();
        const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const fyStartStr = `${fyStartYear}-04-01`;
        const sorted = [...portfolioHistory].sort((a, b) => a.date.localeCompare(b.date));
        const startEntry = sorted.find(h => h.date >= fyStartStr) || sorted[0];
        const latestEntry = sorted[sorted.length - 1];
        if (!startEntry || !latestEntry || startEntry.date === latestEntry.date) return;
        const pct = ((latestEntry.value - startEntry.value) / startEntry.value) * 100;
        setYtdReturn({ pct, startValue: startEntry.value, latestValue: latestEntry.value, startDate: startEntry.date });
    }, [portfolioHistory]);

    // Generate transition alerts and save current states (runs only once)
    useEffect(() => {
        if (!statesLoaded || !alertsLoaded || currentStates.length === 0 || hasProcessedStates.current) return;
        hasProcessedStates.current = true;

        const newTransitionAlerts: Alert[] = [];
        const today = new Date().toISOString().split('T')[0];

        currentStates.forEach(current => {
            const previous = previousStates.find(p => p.stockCode === current.stockCode);
            if (!previous) return; // No previous state to compare

            const enrichedItem = enrichedData.find(
                item => (item.nseCode || item.bseCode) === current.stockCode
            );
            const currentPrice = enrichedItem?.currentPrice || 0;
            const dma50 = enrichedItem?.dma50 || 0;
            const dma200 = enrichedItem?.dma200 || 0;
            // % distance of price from each DMA. Crossings within ±1% are noise
            // (price sitting right on the line) and are filtered out.
            const dma50Pct = dma50 > 0 ? ((currentPrice - dma50) / dma50) * 100 : 0;
            const dma200Pct = dma200 > 0 ? ((currentPrice - dma200) / dma200) * 100 : 0;

            // Crossed below 50 DMA (was above, now below)
            if (previous.above50DMA && !current.above50DMA && Math.abs(dma50Pct) >= 1) {
                newTransitionAlerts.push({
                    id: `${current.stockCode}-crossed-below-50dma-${today}`,
                    stockCode: current.stockCode,
                    stockName: current.stockName,
                    alertType: 'CROSSED_BELOW_50DMA',
                    message: 'Just crossed below 50 DMA',
                    currentPrice,
                    thresholdValue: dma50,
                    changePercent: dma50Pct,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Crossed above 50 DMA (was below, now above)
            if (!previous.above50DMA && current.above50DMA && Math.abs(dma50Pct) >= 1) {
                newTransitionAlerts.push({
                    id: `${current.stockCode}-crossed-above-50dma-${today}`,
                    stockCode: current.stockCode,
                    stockName: current.stockName,
                    alertType: 'CROSSED_ABOVE_50DMA',
                    message: 'Just crossed above 50 DMA',
                    currentPrice,
                    thresholdValue: dma50,
                    changePercent: dma50Pct,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Crossed below 200 DMA
            if (previous.above200DMA && !current.above200DMA && Math.abs(dma200Pct) >= 1) {
                newTransitionAlerts.push({
                    id: `${current.stockCode}-crossed-below-200dma-${today}`,
                    stockCode: current.stockCode,
                    stockName: current.stockName,
                    alertType: 'CROSSED_BELOW_200DMA',
                    message: 'Just crossed below 200 DMA',
                    currentPrice,
                    thresholdValue: dma200,
                    changePercent: dma200Pct,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Crossed above 200 DMA
            if (!previous.above200DMA && current.above200DMA && Math.abs(dma200Pct) >= 1) {
                newTransitionAlerts.push({
                    id: `${current.stockCode}-crossed-above-200dma-${today}`,
                    stockCode: current.stockCode,
                    stockName: current.stockName,
                    alertType: 'CROSSED_ABOVE_200DMA',
                    message: 'Just crossed above 200 DMA',
                    currentPrice,
                    thresholdValue: dma200,
                    changePercent: dma200Pct,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Death Cross (50 DMA crossed below 200 DMA)
            if (previous.dma50Above200 && !current.dma50Above200) {
                newTransitionAlerts.push({
                    id: `${current.stockCode}-death-cross-${today}`,
                    stockCode: current.stockCode,
                    stockName: current.stockName,
                    alertType: 'DEATH_CROSS',
                    message: 'Death Cross: 50 DMA just crossed below 200 DMA',
                    currentPrice,
                    thresholdValue: dma200,
                    changePercent: 0,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Golden Cross (50 DMA crossed above 200 DMA)
            if (!previous.dma50Above200 && current.dma50Above200) {
                newTransitionAlerts.push({
                    id: `${current.stockCode}-golden-cross-${today}`,
                    stockCode: current.stockCode,
                    stockName: current.stockName,
                    alertType: 'GOLDEN_CROSS',
                    message: 'Golden Cross: 50 DMA just crossed above 200 DMA',
                    currentPrice,
                    thresholdValue: dma200,
                    changePercent: 0,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Approaching 52W High (wasn't near, now near)
            if (!previous.near52WeekHigh && current.near52WeekHigh) {
                const downFrom52WH = enrichedItem?.downFrom52WeekHigh || 0;
                newTransitionAlerts.push({
                    id: `${current.stockCode}-near-52w-high-${today}`,
                    stockCode: current.stockCode,
                    stockName: current.stockName,
                    alertType: 'NEAR_52W_HIGH',
                    message: `Near 52W High (${downFrom52WH.toFixed(1)}% away)`,
                    currentPrice,
                    thresholdValue: 5,
                    changePercent: -downFrom52WH,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            // Approaching 52W Low (wasn't near, now near)
            if (!previous.near52WeekLow && current.near52WeekLow) {
                const upFrom52WL = enrichedItem?.upFrom52WeekLow || 0;
                newTransitionAlerts.push({
                    id: `${current.stockCode}-near-52w-low-${today}`,
                    stockCode: current.stockCode,
                    stockName: current.stockName,
                    alertType: 'NEAR_52W_LOW',
                    message: `Near 52W Low (${upFrom52WL.toFixed(1)}% above)`,
                    currentPrice,
                    thresholdValue: 10,
                    changePercent: upFrom52WL,
                    triggeredAt: today,
                    isRead: false,
                });
            }

            const avgBuyPrice = enrichedItem?.averageBuyPrice || 0;

            // Fell below cost (was at/above avg buy price, now below).
            // Require an explicit `false` in the previous state — a missing field
            // (states saved before this feature existed) means "unknown", so we
            // skip firing and let the crossing register on a future update.
            if (previous.belowCost === false && current.belowCost) {
                newTransitionAlerts.push({
                    id: `${current.stockCode}-crossed-below-cost-${today}`,
                    stockCode: current.stockCode,
                    stockName: current.stockName,
                    alertType: 'CROSSED_BELOW_COST',
                    message: 'Just fell below cost',
                    currentPrice,
                    thresholdValue: avgBuyPrice,
                    changePercent: avgBuyPrice > 0 ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100 : 0,
                    triggeredAt: today,
                    isRead: false,
                });
            }
        });

        // Merge new alerts with stored alerts (stored alerts already persisted in Redis)
        const existingIds = new Set(storedAlerts.map(a => a.id));
        const uniqueNewAlerts = newTransitionAlerts.filter(a => !existingIds.has(a.id));
        const allAlerts = [...storedAlerts, ...uniqueNewAlerts];
        setTransitionAlerts(allAlerts);

        // Save current states to Redis
        const saveStates = async () => {
            try {
                await fetch('/api/technical-states', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ states: currentStates }),
                });
            } catch (error) {
                console.error('Error saving technical states:', error);
            }
        };
        saveStates();

        // Save new alerts to Redis (with createdAt timestamp for 24h expiration)
        if (uniqueNewAlerts.length > 0) {
            const saveAlerts = async () => {
                try {
                    const alertsWithTimestamp = uniqueNewAlerts.map(alert => ({
                        ...alert,
                        createdAt: new Date().toISOString(),
                    }));
                    await fetch('/api/alerts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ alerts: alertsWithTimestamp }),
                    });
                } catch (error) {
                    console.error('Error saving alerts:', error);
                }
            };
            saveAlerts();
        }
    }, [statesLoaded, alertsLoaded, currentStates, previousStates, enrichedData, storedAlerts]);

    // Countdown to next alerts refresh — based on newest alert's createdAt + 24h
    useEffect(() => {
        const compute = () => {
            if (storedAlerts.length === 0) { setAlertsRefreshIn(''); return; }
            const newestCreatedAt = (storedAlerts[0] as any).createdAt as string;
            if (!newestCreatedAt) { setAlertsRefreshIn(''); return; }
            const remaining = new Date(newestCreatedAt).getTime() + 86400000 - Date.now();
            if (remaining <= 0) { setAlertsRefreshIn('expired'); return; }
            const h = Math.floor(remaining / 3600000);
            const m = Math.floor((remaining % 3600000) / 60000);
            setAlertsRefreshIn(h > 0 ? `${h}h ${m}m` : `${m}m`);
        };
        compute();
        const id = setInterval(compute, 60000);
        return () => clearInterval(id);
    }, [storedAlerts]);

    // Calculate totals
    const totalCurrentAmount = useMemo(() => {
        return enrichedData.reduce((total, item) => total + (item.calculatedAmount || 0), 0);
    }, [enrichedData]);

    // Helper function to check if stock is less than 1 year old
    const isNewStock = (entryDate: string | null | undefined): boolean => {
        if (!entryDate) return false; // No entry date = old stock
        const entry = new Date(entryDate);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        return entry > oneYearAgo;
    };

    // Helper function to get effective 1Y return for a stock
    const getEffective1YReturn = (item: any): number | null => {
        const entryDate = item.entryDate;
        const entryPrice = item.entryPrice;
        const currentPrice = item.currentPrice;

        // If new stock (< 1 year old) and has entry price, calculate actual return
        if (isNewStock(entryDate) && entryPrice && currentPrice) {
            return ((currentPrice - entryPrice) / entryPrice) * 100;
        }
        // Otherwise use screener's 1Y return
        return item.return1Y;
    };

    // Check if stock was bought more recently than N months ago
    const isNewerThanMonths = (entryDate: string | null | undefined, months: number): boolean => {
        if (!entryDate) return false;
        const entry = new Date(entryDate);
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        return entry > cutoff;
    };

    // Effective return over a fixed window: for stocks bought within the window,
    // use actual return since entry instead of the full screener window return.
    const getEffectivePeriodReturn = (item: any, screenerReturn: number | null, months: number): number | null => {
        const { entryDate, entryPrice, currentPrice } = item;
        if (isNewerThanMonths(entryDate, months) && entryPrice && currentPrice) {
            return ((currentPrice - entryPrice) / entryPrice) * 100;
        }
        return screenerReturn;
    };

    // Per-stock return used for the Return Drivers section, by selected period
    const getDriverReturn = (item: any): number | null => {
        switch (driverPeriod) {
            case '1D':
                return item.return1D;
            case '1M':
                return getEffectivePeriodReturn(item, item.return1M, 1);
            case '3M':
                return getEffectivePeriodReturn(item, item.return3M, 3);
            case '6M':
                return getEffectivePeriodReturn(item, item.return6M, 6);
            case '1Y':
                return getEffective1YReturn(item) ?? item.return6M ?? item.return3M ?? null;
            case 'ALL':
                return item.gainPercentage ?? null;
            default:
                return null;
        }
    };

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
            // For yearly P&L, use effective return (actual return for new stocks, screener for old)
            const effective1YReturn = getEffective1YReturn(item);
            if (effective1YReturn !== null) {
                yearlyPnL += value * effective1YReturn / (100 + effective1YReturn);
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
        const marketCaps: number[] = [];
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
                marketCaps.push(item.marketCap);
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

        // Median market cap across held stocks (a few mega/micro caps skew the mean).
        const sortedMcaps = [...marketCaps].sort((a, b) => a - b);
        const n = sortedMcaps.length;
        const medianMarketCap = n === 0
            ? null
            : n % 2 === 1
                ? sortedMcaps[(n - 1) / 2]
                : (sortedMcaps[n / 2 - 1] + sortedMcaps[n / 2]) / 2;

        return {
            avgPE: peWeight > 0 ? peSum / peWeight : null,
            avgProfitGrowth: profitGrowthWeight > 0 ? profitGrowthSum / profitGrowthWeight : null,
            avgSalesGrowth: salesGrowthWeight > 0 ? salesGrowthSum / salesGrowthWeight : null,
            medianMarketCap,
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

    // Categorize transition alerts into 4 groups with sorting
    const categorizedAlerts = useMemo(() => {
        // Sort order for technicals: 50DMA first, then 200DMA, then Cross, then 52W
        const technicalOrder: Record<string, number> = {
            'CROSSED_BELOW_50DMA': 1,
            'CROSSED_ABOVE_50DMA': 1,
            'CROSSED_BELOW_200DMA': 2,
            'CROSSED_ABOVE_200DMA': 2,
            'DEATH_CROSS': 3,
            'GOLDEN_CROSS': 3,
            'NEAR_52W_LOW': 4,
            'NEAR_52W_HIGH': 4,
            'CROSSED_BELOW_COST': 5,
        };
        // DMA crossings within ±1% are noise. Filter here too (not just at
        // generation) so older sub-1% alerts already saved in the DB are hidden.
        const dmaTypes = new Set(['CROSSED_BELOW_50DMA', 'CROSSED_ABOVE_50DMA', 'CROSSED_BELOW_200DMA', 'CROSSED_ABOVE_200DMA']);
        const passesThreshold = (a: Alert) => !dmaTypes.has(a.alertType) || Math.abs(a.changePercent) >= 1;

        // Reconcile Golden/Death Cross against the stock's CURRENT 50-vs-200
        // alignment. A stored cross that contradicts where the DMAs sit now is
        // stale (whipsaw within the 24h window) and is hidden — so a stock can
        // never show in both Golden and Death Cross.
        const alignByCode = new Map(currentStates.map(s => [s.stockCode, s.dma50Above200]));
        const crossConsistent = (a: Alert) => {
            if (a.alertType === 'DEATH_CROSS') return alignByCode.get(a.stockCode) === false;
            if (a.alertType === 'GOLDEN_CROSS') return alignByCode.get(a.stockCode) === true;
            return true;
        };

        const weakTechnicals = transitionAlerts
            .filter(a => ['DEATH_CROSS', 'CROSSED_BELOW_200DMA', 'CROSSED_BELOW_50DMA', 'NEAR_52W_LOW', 'CROSSED_BELOW_COST'].includes(a.alertType))
            .filter(passesThreshold)
            .filter(crossConsistent)
            .sort((a, b) => (technicalOrder[a.alertType] || 99) - (technicalOrder[b.alertType] || 99));

        const goodTechnicals = transitionAlerts
            .filter(a => ['GOLDEN_CROSS', 'CROSSED_ABOVE_200DMA', 'CROSSED_ABOVE_50DMA', 'NEAR_52W_HIGH'].includes(a.alertType))
            .filter(passesThreshold)
            .filter(crossConsistent)
            .sort((a, b) => (technicalOrder[a.alertType] || 99) - (technicalOrder[b.alertType] || 99));

        // Group weak signals by stock → one row with condition chips + a value.
        const CHIP_LABEL: Record<string, string> = {
            DEATH_CROSS: 'Death cross',
            CROSSED_BELOW_200DMA: 'Below 200 DMA',
            CROSSED_BELOW_50DMA: 'Below 50 DMA',
            NEAR_52W_LOW: 'At 52w low',
            CROSSED_BELOW_COST: 'Below cost',
        };
        const CHIP_ORDER: Record<string, number> = {
            DEATH_CROSS: 0, CROSSED_BELOW_200DMA: 1, CROSSED_BELOW_50DMA: 2, NEAR_52W_LOW: 3, CROSSED_BELOW_COST: 4,
        };
        const rsiByCode = new Map(enrichedData.map(i => [(i.nseCode || i.bseCode || ''), i.rsi]));
        const nseByCode = new Map(enrichedData.map(i => [(i.nseCode || i.bseCode || ''), i.nseCode || '']));
        const ret1DByCode = new Map(enrichedData.map(i => [(i.nseCode || i.bseCode || ''), i.return1D]));
        // Prefer the NSE ticker when the full name is long or the row carries more
        // than one alert (keeps the row from overflowing). Falls back to the full
        // name (CSS ellipsis trims it) when no NSE ticker exists.
        const NAME_LIMIT = 'Suyog Telematics Ltd'.length;
        const displayName = (code: string, name: string, alertCount: number) => {
            const nse = nseByCode.get(code);
            return ((name.length > NAME_LIMIT || alertCount > 1) && nse) ? nse : name;
        };
        const groups = new Map<string, { code: string; name: string; value: number; types: string[] }>();
        for (const a of weakTechnicals) {
            let g = groups.get(a.stockCode);
            if (!g) { g = { code: a.stockCode, name: a.stockName, value: a.changePercent, types: [] }; groups.set(a.stockCode, g); }
            g.types.push(a.alertType);
        }
        const weakGroups = Array.from(groups.values()).map(g => {
            const chips = [...g.types]
                .sort((x, y) => (CHIP_ORDER[x] ?? 9) - (CHIP_ORDER[y] ?? 9))
                .map(t => CHIP_LABEL[t])
                .filter(Boolean);
            const rsi = rsiByCode.get(g.code);
            if (rsi != null && rsi < 30) chips.push(`RSI ${Math.round(rsi)}`);
            const value = ret1DByCode.get(g.code) ?? null;
            return { code: g.code, name: displayName(g.code, g.name, g.types.length), fullName: g.name, value, chips };
        }).sort((a, b) => (a.value ?? 0) - (b.value ?? 0)); // weakest day first

        // Mirror for good signals → "Strengthening" panel.
        const CHIP_LABEL_GOOD: Record<string, string> = {
            GOLDEN_CROSS: 'Golden cross',
            CROSSED_ABOVE_200DMA: 'Above 200 DMA',
            CROSSED_ABOVE_50DMA: 'Above 50 DMA',
            NEAR_52W_HIGH: 'At 52w high',
        };
        const CHIP_ORDER_GOOD: Record<string, number> = {
            GOLDEN_CROSS: 0, CROSSED_ABOVE_200DMA: 1, CROSSED_ABOVE_50DMA: 2, NEAR_52W_HIGH: 3,
        };
        const goodMap = new Map<string, { code: string; name: string; value: number; types: string[] }>();
        for (const a of goodTechnicals) {
            let g = goodMap.get(a.stockCode);
            if (!g) { g = { code: a.stockCode, name: a.stockName, value: a.changePercent, types: [] }; goodMap.set(a.stockCode, g); }
            g.types.push(a.alertType);
        }
        const goodGroups = Array.from(goodMap.values()).map(g => {
            const chips = [...g.types]
                .sort((x, y) => (CHIP_ORDER_GOOD[x] ?? 9) - (CHIP_ORDER_GOOD[y] ?? 9))
                .map(t => CHIP_LABEL_GOOD[t])
                .filter(Boolean);
            const rsi = rsiByCode.get(g.code);
            if (rsi != null && rsi > 70) chips.push(`RSI ${Math.round(rsi)}`);
            const value = ret1DByCode.get(g.code) ?? null;
            return { code: g.code, name: displayName(g.code, g.name, g.types.length), fullName: g.name, value, chips };
        }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)); // strongest day first

        return { weakTechnicals, weakGroups, goodTechnicals, goodGroups };
    }, [transitionAlerts, currentStates, enrichedData]);

    // Helper to get short indicator label
    const getIndicatorLabel = (alertType: string): string => {
        switch (alertType) {
            case 'CROSSED_BELOW_50DMA':
            case 'CROSSED_ABOVE_50DMA':
                return '50DMA';
            case 'CROSSED_BELOW_200DMA':
            case 'CROSSED_ABOVE_200DMA':
                return '200DMA';
            case 'DEATH_CROSS':
            case 'GOLDEN_CROSS':
                return 'Cross';
            case 'NEAR_52W_HIGH':
                return '52W Hi';
            case 'NEAR_52W_LOW':
                return '52W Lo';
            case 'CROSSED_BELOW_COST':
                return 'Cost';
            case 'PROFIT_GROWTH_DROPPED':
            case 'PROFIT_GROWTH_RECOVERED':
                return 'Profit';
            case 'SALES_GROWTH_DROPPED':
            case 'SALES_GROWTH_RECOVERED':
                return 'Sales';
            default:
                return '';
        }
    };

    // Portfolio Return Drivers
    const returnDrivers = useMemo(() => {
        const dataWithContribution = enrichedData
            .filter(item => item.calculatedAmount !== null && item.calculatedAmount > 0)
            .map(item => {
                const weightage = totalCurrentAmount > 0
                    ? (item.calculatedAmount! / totalCurrentAmount) * 100
                    : 0;
                // Per-stock return for the selected period (1D/1M/3M/6M/1Y/All time)
                const periodReturn = getDriverReturn(item);
                const portfolioContribution = (periodReturn !== null && weightage > 0)
                    ? (periodReturn * weightage) / (100 + periodReturn)
                    : null;
                return {
                    name: item.scripName,
                    code: item.nseCode || item.bseCode || '',
                    portfolioContribution,
                    weightage,
                    ytdReturn: periodReturn,
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

        // Top 10 positive and others
        const topPositive = positiveContributors.slice(0, 9);
        const otherPositive = positiveContributors.slice(9);
        const othersPositiveRow = otherPositive.length > 0 ? {
            name: `Others (${otherPositive.length} stocks)`,
            portfolioContribution: otherPositive.reduce((sum, item) => sum + (item.portfolioContribution || 0), 0),
            isOthers: true,
        } : null;

        // Bottom 10 negative and others
        const bottomNegative = negativeContributors.slice(-9).reverse();
        const otherNegative = negativeContributors.slice(0, -9);
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
    }, [enrichedData, totalCurrentAmount, driverPeriod]);

    // Sector Performance - Top 5 Gainers and Losers
    const sectorPerformance = useMemo(() => {
        const sectorMap: Record<string, {
            return1M: number[],
            return3M: number[],
            totalValue: number,
            count: number,
            stocks: { name: string; return1M: number | null }[]
        }> = {};

        enrichedData.forEach(item => {
            const sector = item.industry || item.industryGroup || 'Unknown';
            if (!sectorMap[sector]) {
                sectorMap[sector] = { return1M: [], return3M: [], totalValue: 0, count: 0, stocks: [] };
            }
            if (item.return1M !== null) sectorMap[sector].return1M.push(item.return1M);
            if (item.return3M !== null) sectorMap[sector].return3M.push(item.return3M);
            sectorMap[sector].totalValue += item.calculatedAmount || 0;
            sectorMap[sector].count++;
            sectorMap[sector].stocks.push({
                name: item.scripName || 'Unknown',
                return1M: item.return1M
            });
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
                stocks: data.stocks.sort((a, b) => (b.return1M || 0) - (a.return1M || 0)),
            }))
            .sort((a, b) => b.avgReturn1M - a.avgReturn1M);

        return {
            topGainers: sectorData.slice(0, 5),
            topLosers: sectorData.slice(-5).reverse(),
        };
    }, [enrichedData]);

    // Portfolio Positioning Breakdown
    const positioningBreakdown = useMemo(() => {
        const totalValue = enrichedData.reduce((sum, item) => sum + (item.calculatedAmount || 0), 0);

        const convictionMap: Record<string, { value: number; stocks: { name: string; value: number }[] }> = {};
        const strategyMap: Record<string, { value: number; stocks: { name: string; value: number }[] }> = {};
        const actionMap: Record<string, { value: number; stocks: { name: string; value: number }[] }> = {};

        let untaggedValue = 0;
        let untaggedStocks: { name: string; value: number }[] = [];

        enrichedData.forEach(item => {
            const value = item.calculatedAmount || 0;
            const stockName = item.scripName || 'Unknown';
            const stockCode = item.nseCode || item.bseCode || '';
            const positioning = stockCode ? positioningData[stockCode] : null;

            if (positioning) {
                // Conviction breakdown
                if (!convictionMap[positioning.conviction]) {
                    convictionMap[positioning.conviction] = { value: 0, stocks: [] };
                }
                convictionMap[positioning.conviction].value += value;
                convictionMap[positioning.conviction].stocks.push({ name: stockName, value });

                // Strategy breakdown
                if (!strategyMap[positioning.strategyType]) {
                    strategyMap[positioning.strategyType] = { value: 0, stocks: [] };
                }
                strategyMap[positioning.strategyType].value += value;
                strategyMap[positioning.strategyType].stocks.push({ name: stockName, value });

                // Action breakdown
                if (!actionMap[positioning.actionIntent]) {
                    actionMap[positioning.actionIntent] = { value: 0, stocks: [] };
                }
                actionMap[positioning.actionIntent].value += value;
                actionMap[positioning.actionIntent].stocks.push({ name: stockName, value });
            } else {
                untaggedValue += value;
                untaggedStocks.push({ name: stockName, value });
            }
        });

        const convictions = ALL_CONVICTIONS.map(key => ({
            key,
            label: CONVICTION_LABELS[key],
            value: convictionMap[key]?.value || 0,
            percentage: totalValue > 0 ? ((convictionMap[key]?.value || 0) / totalValue) * 100 : 0,
            stocks: convictionMap[key]?.stocks || [],
        }));

        const strategies = ALL_STRATEGIES.map(key => ({
            key,
            label: STRATEGY_LABELS[key],
            value: strategyMap[key]?.value || 0,
            percentage: totalValue > 0 ? ((strategyMap[key]?.value || 0) / totalValue) * 100 : 0,
            stocks: strategyMap[key]?.stocks || [],
        }));

        const actions = ALL_ACTIONS.map(key => ({
            key,
            label: ACTION_LABELS[key],
            value: actionMap[key]?.value || 0,
            percentage: totalValue > 0 ? ((actionMap[key]?.value || 0) / totalValue) * 100 : 0,
            stocks: actionMap[key]?.stocks || [],
        }));

        return {
            convictions,
            strategies,
            actions,
            untagged: {
                value: untaggedValue,
                percentage: totalValue > 0 ? (untaggedValue / totalValue) * 100 : 0,
                stocks: untaggedStocks,
            },
            totalTagged: totalValue - untaggedValue,
        };
    }, [enrichedData, positioningData]);

    // State for sector hover tooltip
    const [hoveredSector, setHoveredSector] = useState<string | null>(null);

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

    const getAlertIcon = (type: string) => {
        if (type.includes('BELOW') || type.includes('DEATH') || type.includes('LOW') || type.includes('DROPPED')) {
            return '🔴';
        }
        if (type.includes('ABOVE') || type.includes('GOLDEN') || type.includes('HIGH') || type.includes('RECOVERED')) {
            return '🟢';
        }
        if (type.includes('WEAK')) {
            return '🟠';
        }
        return '🟡';
    };

    const getAlertPriorityClass = (type: string) => {
        if (['DEATH_CROSS', 'CROSSED_BELOW_200DMA'].includes(type)) return 'alert-critical';
        if (['CROSSED_BELOW_50DMA', 'NEAR_52W_LOW', 'PROFIT_GROWTH_DROPPED', 'SALES_GROWTH_DROPPED'].includes(type)) return 'alert-high';
        if (['GOLDEN_CROSS', 'CROSSED_ABOVE_50DMA', 'CROSSED_ABOVE_200DMA', 'PROFIT_GROWTH_RECOVERED', 'SALES_GROWTH_RECOVERED'].includes(type)) return 'alert-positive';
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
                        <div className="card-label">Public Value</div>
                        <div className="card-value">{isAnalyst ? '••••••' : formatLakhs(totalCurrentAmount)}</div>
                        <div className="card-subtext">{stockCount} stocks</div>
                    </div>
                    {!isAnalyst && peSummary && peSummary.heldCount > 0 && (
                        <div className="overview-card">
                            <div className="card-label">Private Investments</div>
                            <div className="card-value">{formatLakhs(peSummary.currentNav)}</div>
                            <div className="card-subtext">{peSummary.heldCount} companies · current NAV</div>
                        </div>
                    )}
                    <div className="overview-card">
                        <div className="card-label">Today</div>
                        <div className={`card-value ${pnlMetrics.dailyPercent >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(pnlMetrics.dailyPercent)}
                        </div>
                        {niftySmallcap && (
                            <div className={`card-subtext benchmark ${niftySmallcap.dailyChange >= 0 ? 'positive' : 'negative'}`}>
                                SMLCAP100: {formatPercent(niftySmallcap.dailyChange)}
                            </div>
                        )}
                    </div>
                    <div className="overview-card">
                        <div className="card-label">Weekly</div>
                        <div className={`card-value ${pnlMetrics.weeklyPercent >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(pnlMetrics.weeklyPercent)}
                        </div>
                        {niftySmallcap && (
                            <div className={`card-subtext benchmark ${niftySmallcap.weeklyChange >= 0 ? 'positive' : 'negative'}`}>
                                SC100: {formatPercent(niftySmallcap.weeklyChange)}
                            </div>
                        )}
                    </div>
                    <div className="overview-card">
                        <div className="card-label">Monthly</div>
                        <div className={`card-value ${pnlMetrics.monthlyPercent >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(pnlMetrics.monthlyPercent)}
                        </div>
                        {niftySmallcap && (
                            <div className={`card-subtext benchmark ${niftySmallcap.monthlyChange >= 0 ? 'positive' : 'negative'}`}>
                                SC100: {formatPercent(niftySmallcap.monthlyChange)}
                            </div>
                        )}
                    </div>
                    <div className="overview-card">
                        <div className="card-label">Yearly</div>
                        <div className={`card-value ${pnlMetrics.yearlyPercent >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(pnlMetrics.yearlyPercent)}
                        </div>
                        {niftySmallcap && (
                            <div className={`card-subtext benchmark ${niftySmallcap.yearlyChange >= 0 ? 'positive' : 'negative'}`}>
                                SC100: {formatPercent(niftySmallcap.yearlyChange)}
                            </div>
                        )}
                    </div>
                    {!isAnalyst && ytdReturn && (
                        <div className="overview-card">
                            <div className="card-label">YTD (FY)</div>
                            <div className={`card-value ${ytdReturn.pct >= 0 ? 'positive' : 'negative'}`}>
                                {ytdReturn.pct >= 0 ? '+' : ''}{ytdReturn.pct.toFixed(1)}%
                            </div>
                            <div className="card-subtext">
                                since {ytdReturn.startDate}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Technical Alerts + Return Drivers — side by side */}
            <div className="dashboard-two-col">
            {/* Technical Alerts */}
            <section className="dashboard-section">
                <h2 className="section-title">
                    Technical Alerts
                    <span className="alert-count">({categorizedAlerts.weakGroups.length + categorizedAlerts.goodTechnicals.length})</span>
                    {alertsRefreshIn && (
                        <span className="alerts-refresh-timer">refreshes in {alertsRefreshIn}</span>
                    )}
                </h2>

                {(categorizedAlerts.weakGroups.length + categorizedAlerts.goodTechnicals.length) === 0 ? (
                    <div className="empty-alerts">No state changes detected since last update</div>
                ) : (
                    <div className="alerts-grid">
                        {/* Weakening */}
                        <div className="alert-column weak">
                            <h3 className="weak-panel-title">Weakening <span className="weak-panel-count">{categorizedAlerts.weakGroups.length} holdings</span></h3>
                            <div className="alert-column-list">
                                {categorizedAlerts.weakGroups.map(g => (
                                    <div key={g.code} className="weak-row">
                                        <span className="weak-name" title={g.fullName}>{g.name}</span>
                                        <span className="weak-chips">
                                            {g.chips.map((c, i) => <span key={i} className="weak-chip">{c}</span>)}
                                        </span>
                                        {g.value == null ? (
                                            <span className="weak-value">—</span>
                                        ) : (
                                            <span className={`weak-value ${g.value >= 0 ? 'positive' : 'negative'}`}>
                                                {g.value >= 0 ? '+' : ''}{g.value.toFixed(2)}%
                                            </span>
                                        )}
                                    </div>
                                ))}
                                {categorizedAlerts.weakGroups.length === 0 && (
                                    <div className="alert-empty">None</div>
                                )}
                            </div>
                        </div>

                        {/* Strengthening */}
                        <div className="alert-column good">
                            <h3 className="good-panel-title">Strengthening <span className="weak-panel-count">{categorizedAlerts.goodGroups.length} holdings</span></h3>
                            <div className="alert-column-list">
                                {categorizedAlerts.goodGroups.map(g => (
                                    <div key={g.code} className="weak-row">
                                        <span className="weak-name" title={g.fullName}>{g.name}</span>
                                        <span className="weak-chips">
                                            {g.chips.map((c, i) => <span key={i} className="weak-chip">{c}</span>)}
                                        </span>
                                        {g.value == null ? (
                                            <span className="weak-value">—</span>
                                        ) : (
                                            <span className={`weak-value ${g.value >= 0 ? 'positive' : 'negative'}`}>
                                                {g.value >= 0 ? '+' : ''}{g.value.toFixed(2)}%
                                            </span>
                                        )}
                                    </div>
                                ))}
                                {categorizedAlerts.goodGroups.length === 0 && (
                                    <div className="alert-empty">None</div>
                                )}
                            </div>
                        </div>

                    </div>
                )}
            </section>

            {/* Portfolio Return Drivers */}
            <section className="dashboard-section return-drivers-section">
                <div className="return-drivers-header">
                    <div className="return-drivers-title-row">
                        <h2 className="section-title">
                            Portfolio Return Drivers
                            {returnDrivers && (
                                <span className={`rd-return ${returnDrivers.portfolioReturn >= 0 ? 'positive' : 'negative'}`}>
                                    ({returnDrivers.portfolioReturn >= 0 ? '+' : ''}{returnDrivers.portfolioReturn.toFixed(2)}%)
                                </span>
                            )}
                        </h2>
                        <div className="period-toggle">
                            {(['1D', '1M', '3M', '6M', '1Y', 'ALL'] as const).map(p => (
                                <button
                                    key={p}
                                    className={`toggle-btn ${driverPeriod === p ? 'active' : ''}`}
                                    onClick={() => setDriverPeriod(p)}
                                >
                                    {p === 'ALL' ? 'All Time' : p}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {!returnDrivers ? (
                    <div className="empty-state">No contribution data for this period.</div>
                ) : (
                    <>
                        {/* Zero-centered Horizontal Bar Chart */}
                        <div className="return-drivers-chart">
                            {returnDrivers.unifiedList.map((item, index) => {
                                const contribution = item.portfolioContribution;
                                const isPositive = contribution >= 0;
                                // Baseline offset left so gains (which dominate) get more room to
                                // the right and losses read as short left stubs. Same per-unit
                                // scale on both sides, clamped to each side's span.
                                const BASELINE = 40; // % from left
                                const raw = returnDrivers.maxAbsContribution > 0
                                    ? (Math.abs(contribution) / returnDrivers.maxAbsContribution) * 58
                                    : 0;

                                return (
                                    <div key={index} className={`driver-row ${item.isOthers ? 'others-row' : ''}`}>
                                        {/* Left: Rank + Name */}
                                        <div className="driver-info">
                                            {!item.isOthers && <span className="driver-rank">{item.rank}</span>}
                                            <span className={`driver-name ${item.isOthers ? 'muted' : ''}`}>{item.name}</span>
                                        </div>

                                        {/* Middle: Bar Zone with offset baseline */}
                                        <div className="driver-bar-zone">
                                            <div className="driver-zero-line" style={{ left: `${BASELINE}%` }} />
                                            {isPositive ? (
                                                <div
                                                    className={`driver-bar positive ${item.isOthers ? 'muted' : ''}`}
                                                    style={{
                                                        left: `${BASELINE}%`,
                                                        width: `${Math.min(raw, 58)}%`,
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    className={`driver-bar negative ${item.isOthers ? 'muted' : ''}`}
                                                    style={{
                                                        right: `${100 - BASELINE}%`,
                                                        width: `${Math.min(raw, 38)}%`,
                                                    }}
                                                />
                                            )}
                                        </div>

                                        {/* Right: Value */}
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
            </div>

            {/* Portfolio Health & Weighted Metrics */}
            <section className="dashboard-section">
                <h2 className="section-title">Portfolio Quality</h2>
                <div className="metrics-grid">
                    <div className="metric-card">
                        <div className="metric-label">Weighted Avg P/E</div>
                        <div className="metric-value">
                            {weightedMetrics.avgPE !== null ? weightedMetrics.avgPE.toFixed(2) : 'N/A'}
                        </div>
                        {niftySmallcap && niftySmallcap.pe != null && (
                            <div className="metric-subtext">
                                SMLCAP100: {Number(niftySmallcap.pe).toFixed(2)}
                            </div>
                        )}
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
                        <div className="metric-label">Median Market Cap</div>
                        <div className="metric-value">
                            {weightedMetrics.medianMarketCap !== null ? formatCurrency(weightedMetrics.medianMarketCap) : 'N/A'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-label">Top 5 Concentration</div>
                        <div className={`metric-value ${healthMetrics.top5Concentration > 50 ? 'warning' : ''}`}>
                            {healthMetrics.top5Concentration.toFixed(1)}%
                        </div>
                    </div>
                    {!isAnalyst && (
                        <div className="metric-card">
                            <div className="metric-label">Avg Stock Value</div>
                            <div className="metric-value">
                                {weightedMetrics.avgStockValue !== null ? formatCurrency(weightedMetrics.avgStockValue) : 'N/A'}
                            </div>
                        </div>
                    )}
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

            {/* Portfolio Positioning */}
            <section className="dashboard-section positioning-dashboard-section">
                <h2 className="section-title">Portfolio Positioning</h2>
                {positioningBreakdown.totalTagged === 0 ? (
                    <div className="empty-state">
                        <p>No stocks have positioning set. Set positioning in the stock detail drawer.</p>
                    </div>
                ) : (
                    <div className="positioning-allocation-grid">
                        {/* By Conviction */}
                        <div className="positioning-allocation-card">
                            <h3 className="positioning-allocation-title">By Conviction</h3>
                            <div className="positioning-allocation-bars">
                                {positioningBreakdown.convictions.filter(c => c.value > 0).map(item => (
                                    <div key={item.key} className="positioning-allocation-row">
                                        <span className="positioning-allocation-label">{item.label}</span>
                                        <div className="positioning-allocation-bar-container">
                                            <div
                                                className={`positioning-allocation-bar positioning-bar-${item.key}`}
                                                style={{ width: `${Math.max(item.percentage, 2)}%` }}
                                            />
                                        </div>
                                        <span className="positioning-allocation-percent">{item.percentage.toFixed(1)}%</span>
                                        <div className="positioning-tooltip">
                                            <div className="positioning-tooltip-header">{item.label} Conviction</div>
                                            <div className="positioning-tooltip-stocks">
                                                {item.stocks.slice(0, 10).map((stock, i) => (
                                                    <div key={i} className="positioning-tooltip-stock">
                                                        <span className="positioning-tooltip-stock-name">{stock.name}</span>
                                                        <span className="positioning-tooltip-stock-value">{formatCurrency(stock.value)}</span>
                                                    </div>
                                                ))}
                                                {item.stocks.length > 10 && (
                                                    <div className="positioning-tooltip-stock">
                                                        <span className="positioning-tooltip-stock-name">+{item.stocks.length - 10} more</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* By Strategy */}
                        <div className="positioning-allocation-card">
                            <h3 className="positioning-allocation-title">By Strategy</h3>
                            <div className="positioning-allocation-bars">
                                {positioningBreakdown.strategies.filter(s => s.value > 0).map(item => (
                                    <div key={item.key} className="positioning-allocation-row">
                                        <span className="positioning-allocation-label">{item.label}</span>
                                        <div className="positioning-allocation-bar-container">
                                            <div
                                                className={`positioning-allocation-bar positioning-bar-${item.key}`}
                                                style={{ width: `${Math.max(item.percentage, 2)}%` }}
                                            />
                                        </div>
                                        <span className="positioning-allocation-percent">{item.percentage.toFixed(1)}%</span>
                                        <div className="positioning-tooltip">
                                            <div className="positioning-tooltip-header">{item.label}</div>
                                            <div className="positioning-tooltip-stocks">
                                                {item.stocks.slice(0, 10).map((stock, i) => (
                                                    <div key={i} className="positioning-tooltip-stock">
                                                        <span className="positioning-tooltip-stock-name">{stock.name}</span>
                                                        <span className="positioning-tooltip-stock-value">{formatCurrency(stock.value)}</span>
                                                    </div>
                                                ))}
                                                {item.stocks.length > 10 && (
                                                    <div className="positioning-tooltip-stock">
                                                        <span className="positioning-tooltip-stock-name">+{item.stocks.length - 10} more</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* By Action */}
                        <div className="positioning-allocation-card">
                            <h3 className="positioning-allocation-title">By Action Intent</h3>
                            <div className="positioning-allocation-bars">
                                {positioningBreakdown.actions.filter(a => a.value > 0).map(item => (
                                    <div key={item.key} className="positioning-allocation-row">
                                        <span className="positioning-allocation-label">{item.label}</span>
                                        <div className="positioning-allocation-bar-container">
                                            <div
                                                className={`positioning-allocation-bar positioning-bar-${item.key}`}
                                                style={{ width: `${Math.max(item.percentage, 2)}%` }}
                                            />
                                        </div>
                                        <span className="positioning-allocation-percent">{item.percentage.toFixed(1)}%</span>
                                        <div className="positioning-tooltip">
                                            <div className="positioning-tooltip-header">{item.label}</div>
                                            <div className="positioning-tooltip-stocks">
                                                {item.stocks.slice(0, 10).map((stock, i) => (
                                                    <div key={i} className="positioning-tooltip-stock">
                                                        <span className="positioning-tooltip-stock-name">{stock.name}</span>
                                                        <span className="positioning-tooltip-stock-value">{formatCurrency(stock.value)}</span>
                                                    </div>
                                                ))}
                                                {item.stocks.length > 10 && (
                                                    <div className="positioning-tooltip-stock">
                                                        <span className="positioning-tooltip-stock-name">+{item.stocks.length - 10} more</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {positioningBreakdown.untagged.percentage > 0 && (
                    <p className="positioning-untagged-note">
                        {positioningBreakdown.untagged.percentage.toFixed(1)}% of portfolio ({positioningBreakdown.untagged.stocks.length} stocks) has no positioning set
                    </p>
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
                                <div
                                    key={index}
                                    className="sector-list-item with-hover"
                                    onMouseEnter={() => setHoveredSector(`gainer-${index}`)}
                                    onMouseLeave={() => setHoveredSector(null)}
                                >
                                    <span className="sector-rank">{index + 1}</span>
                                    <span className="sector-name">{sector.sector}</span>
                                    <span className="sector-count">({sector.count} stocks)</span>
                                    <span className={`sector-return ${sector.avgReturn1M >= 0 ? 'positive' : 'negative'}`}>
                                        {formatPercent(sector.avgReturn1M)}
                                    </span>
                                    {hoveredSector === `gainer-${index}` && (
                                        <div className="sector-tooltip">
                                            <div className="sector-tooltip-header">Stocks in {sector.sector}</div>
                                            <div className="sector-tooltip-stocks">
                                                {sector.stocks.map((stock, i) => (
                                                    <div key={i} className="sector-tooltip-stock">
                                                        <span className="stock-name">{stock.name}</span>
                                                        <span className={`stock-return ${(stock.return1M || 0) >= 0 ? 'positive' : 'negative'}`}>
                                                            {stock.return1M !== null ? formatPercent(stock.return1M) : 'N/A'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="sector-list-card">
                        <h3 className="sector-list-title negative">Bottom 5 Sectors (1M)</h3>
                        <div className="sector-list">
                            {sectorPerformance.topLosers.map((sector, index) => (
                                <div
                                    key={index}
                                    className="sector-list-item with-hover"
                                    onMouseEnter={() => setHoveredSector(`loser-${index}`)}
                                    onMouseLeave={() => setHoveredSector(null)}
                                >
                                    <span className="sector-rank">{index + 1}</span>
                                    <span className="sector-name">{sector.sector}</span>
                                    <span className="sector-count">({sector.count} stocks)</span>
                                    <span className={`sector-return ${sector.avgReturn1M >= 0 ? 'positive' : 'negative'}`}>
                                        {formatPercent(sector.avgReturn1M)}
                                    </span>
                                    {hoveredSector === `loser-${index}` && (
                                        <div className="sector-tooltip">
                                            <div className="sector-tooltip-header">Stocks in {sector.sector}</div>
                                            <div className="sector-tooltip-stocks">
                                                {sector.stocks.map((stock, i) => (
                                                    <div key={i} className="sector-tooltip-stock">
                                                        <span className="stock-name">{stock.name}</span>
                                                        <span className={`stock-return ${(stock.return1M || 0) >= 0 ? 'positive' : 'negative'}`}>
                                                            {stock.return1M !== null ? formatPercent(stock.return1M) : 'N/A'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
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

            {niftySmallcap?.lastUpdated && (
                <footer className="dashboard-footer">
                    Priced · {new Date(niftySmallcap.lastUpdated).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', hour12: true,
                    })}
                </footer>
            )}
        </div>
    );
};

export default Dashboard;
