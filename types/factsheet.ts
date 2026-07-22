// Monthly factsheet — manual inputs + derived F&O overlay types.

export type FnoStatus = 'held' | 'exited';
export type FnoBookType = 'hedge' | 'directional';

// A single F&O position as entered by the user. Returns are derived from
// entry vs exit (exited) or entry vs current mark (held).
export interface FnoPosition {
  id: string;
  instrument: string;             // e.g. "NIFTY 24000 CE", "BANKNIFTY FUT"
  bookType: FnoBookType | null;   // hedge/protective vs directional
  status: FnoStatus;
  entryValue: number | null;      // premium paid / cost basis (₹)
  exitValue: number | null;       // proceeds, if exited (₹)
  currentValue: number | null;    // mark-to-market, if held (₹)
  notes: string | null;
}

export interface FactsheetInputs {
  month: string;                  // 'YYYY-MM'
  cashPosition: number | null;    // ₹
  pmNote: string | null;
  fnoPositions: FnoPosition[];
  updatedAt?: string;
}

// Derived F&O overlay figures computed from the positions above.
export interface FnoOverlay {
  realisedPnl: number;            // sum over exited: exitValue - entryValue
  unrealisedPnl: number;          // sum over held: currentValue - entryValue
  combinedPnl: number;            // realised + unrealised
  grossNotional: number;          // sum of |entryValue| across all positions
  hedgePct: number | null;        // % of gross notional that is hedge/protective
  directionalPct: number | null;  // % of gross notional that is directional
}
