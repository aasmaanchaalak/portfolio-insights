// Latest daily close from Yahoo Finance for a ticker with exchange suffix
// (e.g. HDFCBANK.NS). Used by the pipeline price API and the Claude connector.

export interface LiveResult {
  closePrice: number;
  priceDate: string;
  companyName: string | null;
}

export async function fetchLivePrice(tickerWithSuffix: string): Promise<LiveResult | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tickerWithSuffix)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com',
        'Connection': 'keep-alive',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const companyName: string | null = result.meta?.longName || result.meta?.shortName || null;
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = result.timestamp ?? [];

    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) {
        const priceDate = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
        return { closePrice: Math.round(closes[i] * 100) / 100, priceDate, companyName };
      }
    }
    return null;
  } catch {
    return null;
  }
}
