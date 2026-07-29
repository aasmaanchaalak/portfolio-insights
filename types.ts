/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StockPositioning } from './types/positioning';

export interface Stock {
  name: string;
  bseCode: string | null;
  nseCode: string | null;
  industryGroup: string | null;
  industry: string | null;
  currentPrice: number | null;
  priceToEarning: number | null;
  yoyQuarterlyProfitGrowth: number | null;
  yoyQuarterlySalesGrowth: number | null;
  return1D: number | null;
  return1M: number | null;
  return1W: number | null;
  return3M: number | null;
  return6M: number | null;
  return1Y: number | null;
  dma50: number | null;
  dma200: number | null;
  downFrom52WeekHigh: number | null;
  upFrom52WeekLow: number | null;
  // New fields for Dashboard - may not be available in current data
  rsi?: number | null;
  marketCap?: number | null;
  roce?: number | null;
  remarks?: string | null;
  assignedTo?: string | null;
  bucket?: string | null;
  entryDate?: string | null;  // ISO date string (YYYY-MM-DD) when stock was first added
  entryPrice?: number | null; // Price when stock was first added
  positioning?: StockPositioning; // Conviction, strategy, action intent
  themes?: string[];
  pledgedQty?: number | null;     // Quantity pledged for LAS / F&O margin
  pledgedWhere?: 'LAS' | 'F&O' | null; // Where the shares are pledged
}

export interface GridKeyData {
  scripName: string;
  bseCode: string | null;
  nseCode: string | null;
  quantity: number | null;
  averageBuyPrice: number | null;
}