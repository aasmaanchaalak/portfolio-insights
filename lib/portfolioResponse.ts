// Response builders for the portfolio and GridKey reads. Shared by their own
// endpoints and by /api/bootstrap, which returns everything the app shell
// needs in a single request.

import {
  getPortfolioData,
  getAllRemarks,
  getAllAssignments,
  getAllBuckets,
  getAllEntryData,
  getAllPositioning,
  getAllThemes,
  getAllPledges,
  getGridKeyData,
  getPrivateInvestments,
  getAnalystOverrides,
  isVisibleToAnalyst,
  UserRole,
} from './queries';

/** Reads both builders need; pass the same promises to avoid querying twice. */
export interface SharedReads {
  gridKey?: Promise<any[] | null>;
  overrides?: Promise<Record<string, boolean>>;
}

/** GET /api/portfolio payload: Screener rows merged with holdings and metadata. */
export async function getPortfolioResponse(role: UserRole, shared: SharedReads = {}): Promise<any[]> {
  // Everything in one parallel round trip (the Screener snapshot used to be
  // fetched first, costing an extra sequential trip to the database).
  const [portfolioData, remarksMap, assignmentsMap, bucketsMap, entryDataMap, positioningMap, themesMap, pledgesMap, gridKey, overrides] = await Promise.all([
    getPortfolioData(),
    getAllRemarks(),
    getAllAssignments(),
    getAllBuckets(),
    getAllEntryData(),
    getAllPositioning(),
    getAllThemes(),
    getAllPledges(),
    shared.gridKey ?? getGridKeyData(),
    role === 'analyst' ? (shared.overrides ?? getAnalystOverrides()) : Promise.resolve(null),
  ]);

  if (!portfolioData || portfolioData.length === 0) return [];

  // Build GridKey lookup by stock code
  const gridKeyByCode: Record<string, { quantity: number | null; averageBuyPrice: number | null }> = {};
  for (const item of gridKey || []) {
    const code = item.nseCode || item.bseCode;
    if (!code) continue;
    gridKeyByCode[code] = {
      quantity: item.quantity != null ? Number(item.quantity) : null,
      averageBuyPrice: item.averageBuyPrice != null ? Number(item.averageBuyPrice) : null,
    };
  }

  // First pass: merge metadata, GridKey, and per-stock computed fields
  const firstPass = portfolioData.map((stock: any) => {
    const code = stock.nseCode || stock.bseCode;
    const entryData = code && entryDataMap[code] ? entryDataMap[code] : null;
    const gk = code && gridKeyByCode[code] ? gridKeyByCode[code] : { quantity: null, averageBuyPrice: null };
    const currentPrice = stock.currentPrice ? Number(stock.currentPrice) : null;
    const calculatedAmount = (gk.quantity != null && currentPrice != null) ? gk.quantity * currentPrice : null;
    const investedAmount = (gk.quantity != null && gk.averageBuyPrice != null) ? gk.quantity * gk.averageBuyPrice : null;
    const absoluteGain = (calculatedAmount != null && investedAmount != null) ? calculatedAmount - investedAmount : null;
    const gainPercentage = (investedAmount != null && investedAmount > 0 && absoluteGain != null) ? (absoluteGain / investedAmount) * 100 : null;
    const dma50 = stock.dma50 ? Number(stock.dma50) : null;
    const dma200 = stock.dma200 ? Number(stock.dma200) : null;
    const dma50ChangePercent = (currentPrice != null && dma50 != null && dma50 !== 0) ? ((currentPrice - dma50) / dma50) * 100 : null;
    const dma200ChangePercent = (currentPrice != null && dma200 != null && dma200 !== 0) ? ((currentPrice - dma200) / dma200) * 100 : null;
    return {
      ...stock,
      quantity: gk.quantity,
      averageBuyPrice: gk.averageBuyPrice,
      calculatedAmount,
      investedAmount,
      absoluteGain,
      gainPercentage,
      dma50ChangePercent,
      dma200ChangePercent,
      remarks: code && remarksMap[code] ? remarksMap[code] : null,
      assignedTo: code && assignmentsMap[code] ? assignmentsMap[code] : null,
      bucket: code && bucketsMap[code] ? bucketsMap[code] : null,
      entryDate: entryData ? entryData.entryDate : null,
      entryPrice: entryData ? entryData.entryPrice : null,
      positioning: code && positioningMap[code] ? positioningMap[code] : null,
      themes: code && themesMap[code] ? themesMap[code] : [],
      pledgedQty: code && pledgesMap[code] ? pledgesMap[code].pledgedQty : null,
      pledgedWhere: code && pledgesMap[code] ? pledgesMap[code].pledgedWhere : null,
    };
  });

  // Second pass: compute weightage and portfolioContribution using total portfolio value
  const totalPortfolioValue = firstPass.reduce((sum: number, s: any) => sum + (s.calculatedAmount || 0), 0);
  const enrichedData = firstPass.map((stock: any) => {
    const weightage = totalPortfolioValue > 0 && stock.calculatedAmount != null
      ? (stock.calculatedAmount / totalPortfolioValue) * 100
      : null;
    const ytdReturn = stock.return1Y ?? stock.return6M ?? stock.return3M ?? null;
    const portfolioContribution = (ytdReturn != null && weightage != null) ? (ytdReturn * weightage) / 100 : null;
    return { ...stock, weightage, portfolioContribution };
  });

  let visibleData = enrichedData;
  if (overrides) {
    visibleData = enrichedData.filter((stock: any) => {
      const code = stock.nseCode || stock.bseCode;
      if (!code) return true;
      const invested = stock.investedAmount || 0;
      return isVisibleToAnalyst(invested, code, overrides);
    });
  }
  return visibleData;
}

/** GET payload: holdings (filtered for analysts) plus private-investment totals. */
export async function getGridKeyResponse(role: UserRole, shared: SharedReads = {}) {
  const [gridKeyData, privateInvestments, overrides] = await Promise.all([
    shared.gridKey ?? getGridKeyData(),
    getPrivateInvestments(),
    role === 'analyst' ? (shared.overrides ?? getAnalystOverrides()) : Promise.resolve(null),
  ]);

  let visibleData = gridKeyData || [];
  if (overrides) {
    visibleData = visibleData.filter((item: any) => {
      const code = item.nseCode || item.bseCode;
      const invested = (Number(item.quantity) || 0) * (Number(item.averageBuyPrice) || 0);
      return isVisibleToAnalyst(invested, code, overrides);
    });
  }
  return { gridKeyData: visibleData, privateInvestments };
}

