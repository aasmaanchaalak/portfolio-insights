// F&O data shared by the upload parser (browser), the API and the pages.

// GridKey portfolio whose holdings sit in the F&O (Nuvama) account. Its rows in
// the GridKey upload become the account's collateral and hedge cover.
export const FO_PORTFOLIO = 'UMA AGARWAL';

export type LegType = 'FUT' | 'CE' | 'PE';
export type Purpose = 'Hedge' | 'Income' | 'Directional';
export const PURPOSES: Purpose[] = ['Hedge', 'Income', 'Directional'];

/** One contract line of a broker P&L report. Open legs have qty ≠ 0; legs closed that day have qty 0 and realised ≠ 0. */
export interface ReportLeg {
  contract: string;       // broker's instrument string, e.g. "ASHOKLEY-FUT-27Oct2026-NSE"
  underlying: string;     // NSE symbol, e.g. "ASHOKLEY", "NIFTY"
  type: LegType;
  expiry: string;         // YYYY-MM-DD
  strike: number | null;
  qty: number;            // signed: + long, − short
  avg: number;            // average open price (Nuvama includes charges)
  ltp: number;            // closing price on the report date
  unrealised: number;     // (ltp − avg) × qty
  realised: number;       // realised P&L in the report period
  dayPnl: number | null;  // broker's day P&L, when given
}

export interface ReportTrade {
  contract: string;
  date: string;           // YYYY-MM-DD
  side: 'Buy' | 'Sell';
  qty: number;            // absolute
  price: number;
  charges: number;        // brokerage + taxes + fees
}

/** A parsed report, stripped of the client's personal details. */
export interface FoReport {
  broker: 'nuvama';
  account: string;        // "nuvama:<client code>"
  asOf: string;           // YYYY-MM-DD, the report's (single-day) period
  legs: ReportLeg[];
  trades: ReportTrade[];
}

export interface FoHolding {
  name: string;
  nseCode: string | null;
  bseCode: string | null;
  quantity: number;
}

// ---------- dashboard payload ----------

export interface DashLeg {
  account: string;
  contract: string;
  underlying: string;
  type: LegType;
  expiry: string;
  strike: number | null;
  purpose: Purpose;
  purposeIsDefault: boolean;
  qty: number;
  lots: number | null;
  avg: number;
  ltp: number;            // live estimate when the market has moved since the report
  ltpIsEstimate: boolean;
  today: number | null;
  openPnl: number;
  deltaRs: number;
  margin: number;         // ₹ (0 for long options)
}

export interface DashUnderlying {
  symbol: string;
  spot: number | null;
  spotChangePct: number | null;
  sharesHeld: number | null;
  hedgedPct: number | null;
  coverKind: 'hedged' | 'covered' | null;
}

export interface DashMargin {
  used: number;           // limits utilised: SPAN + exposure + the day's MTM loss
  spanExposure: number;   // Σ leg margins
  mtmLoss: number;        // unsettled MTM loss on futures today (0 when in profit)
  isEstimate: boolean;    // some leg had no SPAN rate (options, or NSE file unavailable)
  spanAsOf: string | null; // date of the NSE SPAN file used
  enteredOn: string | null;
  cash: number;           // Cash Available (negative = debit balance)
  pledged: number | null; // Nuvama's Margin from Pledged Holdings; null = estimated from holdings
  holdingsValue: number;  // market value of the account's holdings
  collateral: { name: string; sub: string; marketValue: number; haircutPct: number; value: number; cashLike: boolean }[];
  available: number;      // cash + pledged (Nuvama's Net Cash Value)
  cashForRule: number;    // cash + liquid funds after haircut
}

/** Technical levels of an F&O underlying, for the Overview's Technical Alerts. */
export interface FoTechnical {
  symbol: string;
  price: number;
  return1D: number | null;
  dma50: number;
  dma200: number | null;
  high52: number;
  low52: number;
  rsi: number | null;
  downFrom52WeekHigh: number | null;
  upFrom52WeekLow: number | null;
}

export interface FoDashboard {
  accounts: string[];
  asOf: string | null;            // latest report date
  pricedAt: string | null;        // live spot time, when newer than the report
  legs: DashLeg[];
  underlyings: DashUnderlying[];
  book: number | null;            // public portfolio value, for delta % of book
  month: { key: string; label: string; charges: number; net: number; days: { date: string; pnl: number; live: boolean }[];
           byUnderlying: { name: string; pnl: number }[]; closed: number; byPurpose: Record<Purpose, number> } | null;
  margin: DashMargin;
  nextExpiry: { date: string; legs: number; days: number } | null;
  technicals: FoTechnical[];
}
