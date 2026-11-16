// Saving a new holdings snapshot, shared by the two PF Data uploads: a complete
// PF export (/api/gridkey) and a transactions upload (/api/pf-transactions),
// which applies trades to the last snapshot and saves the result here.
//
// Besides the holdings themselves this:
// - records entry date/price for stocks appearing for the first time
// - moves fully-exited stocks to Pipeline → Exited-Watch and records the
//   realised exit
// - saves the F&O account's rows and every account's rows (account split)

import {
  getGridKeyData,
  saveGridKeyData,
  savePrivateInvestments,
  getPortfolioData,
  getAllEntryData,
  setEntryData,
  getFYStartPrices,
  recordRealizedExit,
} from './queries';
import { upsertExitedWatchIdea } from './pipeline/queries';
import { setHoldings } from './fo/queries';
import { getOpsSettings } from './firmSettings';
import { saveAccountHoldings } from './accounts';

export interface AccountRowInput {
  portfolio: string;
  name: string;
  nseCode: string | null;
  bseCode: string | null;
  quantity: number;
  averageBuyPrice: number | null;
}

/** Known date/price for an entry or exit (from transactions); else today and the last price. */
export type DatePriceHints = Record<string, { date: string; price: number | null }>;

export interface SnapshotInput {
  data: any[];                       // merged holdings, one row per stock
  privateInvestments: { totalInvested: number; count: number };
  accountRows: AccountRowInput[] | null;  // per-portfolio rows, when known
  by: string;                        // user name for audit / Exited-Watch
  entryHints?: DatePriceHints;
  exitHints?: DatePriceHints;
}

export interface SnapshotResult {
  newStocks: { code: string; name: string }[];
  exitedStocks: { ticker: string; companyName: string }[];
}

export async function saveHoldingsSnapshot(input: SnapshotInput): Promise<SnapshotResult> {
  const { data: gridKeyData, privateInvestments, accountRows, by, entryHints = {}, exitHints = {} } = input;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Get existing GridKey data to detect new stocks
  const existingData = await getGridKeyData() || [];
  const existingCodes = new Set(
    existingData
      .map((item: any) => item.nseCode || item.bseCode)
      .filter((code: string | null) => code)
  );

  // Get existing entry data codes
  const existingEntryData = await getAllEntryData();
  const existingEntryDataCodes = new Set(Object.keys(existingEntryData));

  // Find new stocks (in new data but not in existing data AND don't have entry data yet)
  const newStockCodes: string[] = [];
  const newStocks: { code: string; name: string }[] = [];
  for (const item of gridKeyData) {
    const code = item.nseCode || item.bseCode;
    if (code && !existingCodes.has(code) && !existingEntryDataCodes.has(code)) {
      newStockCodes.push(code);
      newStocks.push({ code, name: item.scripName || code });
    }
  }

  // If there are new stocks, record their entry data
  if (newStockCodes.length > 0) {
    const portfolioData = await getPortfolioData() || [];

    // Create a map of stock codes to current prices from portfolio data
    const priceMap: Record<string, number> = {};
    for (const stock of portfolioData) {
      const code = stock.nseCode || stock.bseCode;
      if (code && stock.currentPrice) {
        priceMap[code] = stock.currentPrice;
      }
    }

    // Create a map of stock codes to average buy prices from GridKey data
    const avgBuyPriceMap: Record<string, number> = {};
    for (const item of gridKeyData) {
      const code = item.nseCode || item.bseCode;
      if (code && item.averageBuyPrice) {
        avgBuyPriceMap[code] = item.averageBuyPrice;
      }
    }

    // Record entry data for new stocks. A transactions upload knows the first
    // buy's date and price; a full snapshot only knows the stock first appears
    // today (price can be filled in later on the Entry Data page).
    for (const code of newStockCodes) {
      const hint = entryHints[code];
      const entryDate = hint?.date ?? today;
      const entryPrice = hint?.price ?? priceMap[code] ?? avgBuyPriceMap[code] ?? null;
      await setEntryData(code, entryDate, entryPrice);
      console.log(`Recorded entry data for new stock ${code}: date=${entryDate}, price=${entryPrice ?? 'unknown'}`);
    }
  }

  // Detect fully-exited holdings: a stock present in the previous snapshot
  // but gone from this one has been sold out. Auto-move it to the pipeline's
  // Exited-Watch stage so exits stay on the radar. The snapshot is the full
  // holdings, so absence == exit (mirrors the new-stock detection above).
  const exitedStocks: { ticker: string; companyName: string }[] = [];
  try {
    const newCodes = new Set(
      gridKeyData
        .map((item: any) => item.nseCode || item.bseCode)
        .filter((code: string | null) => code)
    );
    const exitedHoldings = existingData.filter((item: any) => {
      const code = item.nseCode || item.bseCode;
      return code && !newCodes.has(code) && (Number(item.quantity) || 0) > 1;
    });

    if (exitedHoldings.length > 0) {
      // Last-known price map (exit price proxy) from the current portfolio snapshot.
      const portfolioData = await getPortfolioData() || [];
      const priceMap: Record<string, number> = {};
      for (const stock of portfolioData) {
        const code = stock.nseCode || stock.bseCode;
        if (code && stock.currentPrice) priceMap[code] = stock.currentPrice;
      }

      // Entry data + FY-start prices are used to attribute the realized gain
      // to the current financial year.
      const [entryData, fyStartPrices] = await Promise.all([
        getAllEntryData(),
        getFYStartPrices(),
      ]);

      for (const item of exitedHoldings) {
        const ticker = item.nseCode || item.bseCode;
        const companyName = item.scripName || ticker;
        const hint = exitHints[ticker];
        const exitPrice = hint?.price ?? priceMap[ticker] ?? item.averageBuyPrice ?? null;

        const result = await upsertExitedWatchIdea({
          ticker,
          companyName,
          addedBy: by || 'System',
          priceAtAdd: exitPrice,
        });
        if (result.action !== 'skipped') {
          exitedStocks.push({ ticker, companyName });
        }

        // Snapshot realized P&L inputs so this exit still feeds period returns.
        const entry = entryData[ticker] || entryData[item.nseCode] || entryData[item.bseCode] || null;
        const fyStartPrice =
          fyStartPrices[String(ticker).toUpperCase()] ??
          (item.bseCode ? fyStartPrices[String(item.bseCode).toUpperCase()] : undefined) ??
          null;
        await recordRealizedExit({
          ticker,
          companyName,
          quantity: item.quantity ?? null,
          avgBuyPrice: item.averageBuyPrice ?? null,
          exitPrice,
          exitDate: hint?.date ?? today,
          entryDate: entry?.entryDate ?? null,
          entryPrice: entry?.entryPrice ?? null,
          fyStartPrice,
        });

        console.log(`Exited holding ${ticker} → Exited-Watch (${result.action}) + realized recorded`);
      }
    }
  } catch (exitError) {
    // Never let pipeline sync break the upload.
    console.error('Error syncing exited holdings to pipeline:', exitError);
  }

  // Save the holdings
  await Promise.all([
    saveGridKeyData(gridKeyData),
    savePrivateInvestments(
      privateInvestments?.totalInvested || 0,
      privateInvestments?.count || 0
    )
  ]);

  // The F&O account's holdings (only when each row's portfolio is known): the
  // rows of the portfolio set in Operations settings.
  const { foPortfolio } = await getOpsSettings();
  if (Array.isArray(accountRows) && foPortfolio) {
    const clean = accountRows
      .filter((h: any) => h && typeof h.name === 'string' && Number(h.quantity) > 0 && (h.nseCode || h.bseCode)
        && String(h.portfolio || '').trim().toLowerCase() === foPortfolio.toLowerCase())
      .map((h: any) => ({ name: h.name, nseCode: h.nseCode || null, bseCode: h.bseCode || null, quantity: Number(h.quantity) }));
    await setHoldings(foPortfolio, clean, by);
  }

  // Every account's own rows, for the account / family office split.
  if (Array.isArray(accountRows) && accountRows.length > 0) {
    const rows = accountRows
      .filter((h: any) => h && typeof h.name === 'string' && String(h.portfolio || '').trim() && Number(h.quantity) > 0 && (h.nseCode || h.bseCode))
      .map((h: any) => ({
        portfolio: String(h.portfolio).trim(),
        name: h.name,
        nseCode: h.nseCode || null,
        bseCode: h.bseCode || null,
        quantity: Number(h.quantity),
        averageBuyPrice: h.averageBuyPrice != null && isFinite(Number(h.averageBuyPrice)) ? Number(h.averageBuyPrice) : null,
      }));
    if (rows.length > 0) await saveAccountHoldings(rows, by);
  }

  return { newStocks, exitedStocks };
}
