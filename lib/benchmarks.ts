// Benchmark indices the admin can pick from (client-safe — no server imports).
// `symbol` is NSE's indexSymbol as returned by getAllIndices(); `short` is the
// compact tag used on Dashboard cards.

export interface Benchmark {
  symbol: string;
  label: string;
  short: string;
}

export const BENCHMARKS: Benchmark[] = [
  { symbol: 'NIFTY 50', label: 'Nifty 50', short: 'N50' },
  { symbol: 'NIFTY 100', label: 'Nifty 100', short: 'N100' },
  { symbol: 'NIFTY 200', label: 'Nifty 200', short: 'N200' },
  { symbol: 'NIFTY 500', label: 'Nifty 500', short: 'N500' },
  { symbol: 'NIFTY TOTAL MKT', label: 'Nifty Total Market', short: 'NTM' },
  { symbol: 'NIFTY500 MULTICAP', label: 'Nifty 500 Multicap 50:25:25', short: 'MULTI' },
  { symbol: 'NIFTY LARGEMID250', label: 'Nifty LargeMidcap 250', short: 'LM250' },
  { symbol: 'NIFTY MIDCAP 100', label: 'Nifty Midcap 100', short: 'MC100' },
  { symbol: 'NIFTY MIDCAP 150', label: 'Nifty Midcap 150', short: 'MC150' },
  { symbol: 'NIFTY MIDSML 400', label: 'Nifty MidSmallcap 400', short: 'MS400' },
  { symbol: 'NIFTY SMLCAP 100', label: 'Nifty Smallcap 100', short: 'SC100' },
  { symbol: 'NIFTY SMLCAP 250', label: 'Nifty Smallcap 250', short: 'SC250' },
  { symbol: 'NIFTY SMALLCAP 500', label: 'Nifty Smallcap 500', short: 'SC500' },
  { symbol: 'NIFTY MICROCAP250', label: 'Nifty Microcap 250', short: 'MIC250' },
];

export const DEFAULT_BENCHMARK = 'NIFTY SMLCAP 100';

export function findBenchmark(symbol: string | null | undefined): Benchmark {
  return BENCHMARKS.find(b => b.symbol === symbol)
    ?? BENCHMARKS.find(b => b.symbol === DEFAULT_BENCHMARK)!;
}
