/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  remarks?: string | null;
  assignedTo?: string | null;
}

export interface GridKeyData {
  scripName: string;
  bseCode: string | null;
  nseCode: string | null;
  quantity: number | null;
  averageBuyPrice: number | null;
}